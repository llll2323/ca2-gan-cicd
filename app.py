from flask import Flask, render_template, request, jsonify, redirect, url_for, session
import requests
import os
import json
import logging
import sys
from flask_sqlalchemy import SQLAlchemy
import base64
from sqlalchemy.types import String
from sqlalchemy import cast
from functools import wraps
import numpy as np
from PIL import Image
import io
from datetime import datetime
import boto3
from botocore.exceptions import ClientError

app = Flask(__name__)

# PostgreSQL Database Connection (Aiven)
app.config['SQLALCHEMY_DATABASE_URI'] = "mysql+pymysql://avnadmin:AVNS_BEmbjqYE2EpS34WfDDQ@mysql-2b7479e9-ca2-gan.i.aivencloud.com:15217/defaultdb?ssl_ca=./ca.pem"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# AWS Configuration
app.config['AWS_ACCESS_KEY'] = 'YOUR_AWS_ACCESS_KEY'
app.config['AWS_SECRET_KEY'] = 'YOUR_AWS_SECRET_KEY'
app.config['AWS_BUCKET_NAME'] = 'YOUR_BUCKET_NAME'
app.config['AWS_REGION'] = 'ap-southeast-1'  # Singapore region

# Use AWS secret key as Flask secret key
app.secret_key = 'YOUR_AWS_SECRET_KEY'

db = SQLAlchemy(app)

# Add these near the top with your other configurations
USERNAME = 'admin'
PASSWORD = 'password123'  # In production, use hashed passwords

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Define a database model
class GenerationHistory(db.Model):
    __tablename__ = 'generation_history'
    id = db.Column(db.Integer, primary_key=True)
    vector = db.Column(db.JSON, nullable=False)  # Store vector as JSON
    created_at = db.Column(db.DateTime, server_default=db.func.now())  # Timestamp
    s3_url = db.Column(db.String(255), nullable=False)  # Store S3 URL

# Create tables if they don't exist
with app.app_context():
    db.create_all()

# Example route to check database connectivity
@app.route('/test_db')
def test_db():
    entries = GenerationHistory.query.all()
    return f"Found {len(entries)} records in generation history."

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger('gan_app')
logger.setLevel(logging.DEBUG)

logger.debug("Logging system initialized")
logger.info("Application starting up")

MODEL_URL = "https://ca2-daaa2b04-2317748-lixiangong.onrender.com/v1/models/generator:predict"

# Initialize AWS S3 client
def get_s3_client():
    return boto3.client(
        's3',
        aws_access_key_id=app.config['AWS_ACCESS_KEY'],
        aws_secret_access_key=app.config['AWS_SECRET_KEY'],
        region_name=app.config['AWS_REGION']
    )

def upload_to_s3(image_data, filename):
    """Upload an image to S3 and return the public URL"""
    try:
        # Convert PIL Image to bytes
        img_bytes = io.BytesIO()
        image_data.save(img_bytes, format='JPEG')
        img_bytes.seek(0)

        # Upload to S3
        s3_client = get_s3_client()
        s3_client.upload_fileobj(
            img_bytes,
            app.config['AWS_BUCKET_NAME'],
            filename,
            ExtraArgs={
                'ContentType': 'image/jpeg',
                'ACL': 'public-read'  # Make the file publicly accessible
            }
        )

        # Generate the public URL
        url = f"https://{app.config['AWS_BUCKET_NAME']}.s3.{app.config['AWS_REGION']}.amazonaws.com/{filename}"
        return url

    except ClientError as e:
        logger.error(f"Error uploading to S3: {e}")
        return None

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        if request.form['username'] == USERNAME and request.form['password'] == PASSWORD:
            session['logged_in'] = True
            return redirect(url_for('index'))
        error = 'Invalid credentials. Please try again.'
    return render_template('login.html', error=error)

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/generate', methods=['POST'])
@login_required
def generate():
    try:
        if request.json and 'instances' in request.json:
            response = requests.post(MODEL_URL, 
                                   json=request.json,  
                                   headers={'Content-Type': 'application/json'})
            
            if response.status_code == 200:
                result = response.json()
                
                # Process image and upload to S3
                image_array = np.array(result['predictions'][0])
                image = process_image_for_s3(image_array)
                filename = f"gan_image_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                s3_url = upload_to_s3(image, filename)
                
                if not s3_url:
                    return jsonify({'status': 'error', 'message': 'Failed to upload image to S3'}), 500

                # Save to MySQL with S3 URL
                new_record = GenerationHistory(
                    vector=request.json['instances'][0],
                    s3_url=s3_url
                )
                db.session.add(new_record)
                db.session.commit()

                logger.info(f"Generated S3 URL: {s3_url}")

                return jsonify({
                    'status': 'success',
                    'vector': request.json['instances'][0],
                    'image': result['predictions'],
                    's3_url': s3_url
                })
            else:
                return jsonify({'status': 'error', 'message': f'Model request failed: {response.text}'}), 500
                
        else:
            return jsonify({'status': 'error', 'message': 'No instances in request'}), 400
            
    except Exception as e:
        logger.error(f"Error in generate: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/generate_from_vector', methods=['POST'])
@login_required
def generate_from_vector():
    try:
        data = request.get_json()
        logger.info("Received entire data: %s", data)

        instances = data.get('instances')
        if not instances or len(instances) == 0:
            raise ValueError("No instances provided")

        vector = instances[0]
        logger.info(f"Received vector (first 5 values): {vector[:5]}...")

        if len(vector) != 100:
            raise ValueError("Invalid vector: must be an array of 100 numbers")

        payload = {
            "signature_name": "serving_default",
            "instances": [vector]  
        }

        logger.info("Sending payload to model...")
        headers = {'Content-Type': 'application/json'}
        response = requests.post(MODEL_URL, json=payload, headers=headers)

        if response.status_code == 200:
            result = response.json()
            
            # Process image and upload to S3
            image_array = np.array(result['predictions'][0])
            image = process_image_for_s3(image_array)
            filename = f"gan_image_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
            s3_url = upload_to_s3(image, filename)
            
            if not s3_url:
                return jsonify({'status': 'error', 'message': 'Failed to upload image to S3'}), 500

            # Save to MySQL with S3 URL
            new_record = GenerationHistory(
                vector=vector,
                s3_url=s3_url
            )
            db.session.add(new_record)
            db.session.commit()

            return jsonify({
                'status': 'success',
                'vector': vector,
                'image': result['predictions'],
                's3_url': s3_url
            })
        else:
            error_msg = f'Model request failed: {response.text}'
            logger.error(f"Error: {error_msg}")
            return jsonify({
                'status': 'error',
                'message': error_msg
            }), 500

    except Exception as e:
        logger.error(f"Error in generate_from_vector: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/history', methods=['GET'])
@login_required
def get_history():
    try:
        app.logger.info("Starting history retrieval...")
        page = request.args.get('page', 1, type=int)
        per_page = 10
        search_type = request.args.get('search_type', '')
        search_vector = request.args.get('search_vector', '')
        threshold = float(request.args.get('threshold', 0.08))
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        
        app.logger.info(f"Query parameters: page={page}, search_type={search_type}, date_from={date_from}, date_to={date_to}")
        
        base_query = GenerationHistory.query

        if date_from:
            base_query = base_query.filter(GenerationHistory.created_at >= date_from)
        if date_to:
            base_query = base_query.filter(GenerationHistory.created_at <= date_to + ' 23:59:59')

        if search_type == 'exact' and search_vector:
            try:
                search_vec = json.loads(search_vector)
                all_results = base_query.order_by(GenerationHistory.id.desc()).limit(1000).all()
                results = []
                
                for record in all_results:
                    if all(abs(a - b) < 1e-10 for a, b in zip(search_vec, record.vector)):
                        results.append(record)
                
            except Exception as e:
                app.logger.error(f"Error in exact vector search: {e}")
                results = []
                
        elif search_type == 'similar' and search_vector:
            try:
                search_vec = json.loads(search_vector)
                all_results = base_query.order_by(GenerationHistory.id.desc()).limit(1000).all()
                results = []
                
                for record in all_results:
                    try:
                        similarity = calculate_similarity(search_vec, record.vector)
                        if similarity > threshold:
                            results.append((record, similarity))
                    except Exception as e:
                        app.logger.error(f"Error calculating similarity for record {record.id}: {e}")
                        continue
                
                results.sort(key=lambda x: x[1], reverse=True)
                results = [r[0] for r in results]
                
            except Exception as e:
                app.logger.error(f"Error in similarity search: {e}")
                results = []
        else:
            results = base_query.order_by(GenerationHistory.id.desc()).limit(1000).all()
            app.logger.info(f"Retrieved {len(results)} total results")

        start = (page - 1) * per_page
        end = start + per_page
        paginated_results = results[start:end]
        app.logger.info(f"Paginated results: {len(paginated_results)} items (page {page})")

        history_list = []
        for entry in paginated_results:
            try:
                app.logger.info(f"Processing entry ID: {entry.id}")
                
                history_item = {
                    'id': entry.id,
                    'vector': entry.vector,
                    'date': entry.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                    'similarity': getattr(entry, 'similarity', None),
                    's3_url': entry.s3_url
                }
                
                history_list.append(history_item)
                
            except Exception as e:
                app.logger.error(f"Error processing entry {entry.id}: {str(e)}")
                app.logger.exception("Full traceback:")
                continue

        app.logger.info(f"Returning {len(history_list)} history items")
        return jsonify({
            'status': 'success',
            'history': history_list
        })

    except Exception as e:
        app.logger.error('Error fetching history: %s', str(e))
        app.logger.exception("Full traceback:")
        return jsonify({'status': 'error', 'message': str(e)}), 500

def calculate_similarity(vector1, vector2):
    """Calculate cosine similarity between two vectors"""
    dot_product = sum(a * b for a, b in zip(vector1, vector2))
    norm1 = sum(a * a for a in vector1) ** 0.5
    norm2 = sum(b * b for b in vector2) ** 0.5
    return dot_product / (norm1 * norm2) if norm1 * norm2 != 0 else 0

def process_image_for_s3(image_array):
    """Helper function to process image array into correct format"""
    try:
        logger.debug(f"Original image array shape: {image_array.shape}")
        logger.debug(f"Original array type: {type(image_array)}")
        logger.debug(f"Sample of original values: {image_array.flatten()[:10]}")
        
        image_array = np.array(image_array)
        
        if len(image_array.shape) == 3 and image_array.shape[0] == 1:
            logger.debug("Found 3D array with batch dimension, taking first image")
            image_array = image_array[0]
        elif len(image_array.shape) == 3:
            logger.debug("Found 3D array, taking first channel")
            image_array = image_array[:, :, 0]
        elif len(image_array.shape) == 1:
            logger.debug("Found 1D array, reshaping to 28x28")
            image_array = image_array.reshape(28, 28)
            
        logger.debug(f"Processed array shape: {image_array.shape}")
        logger.debug(f"Array min/max values: {np.min(image_array)}, {np.max(image_array)}")
            
        width = height = 280  # 10x original size
        image = Image.new('RGB', (width, height), (0, 0, 0))
        
        scaled_array = np.round((image_array + 1) * 127.5)
        scaled_array = np.clip(scaled_array, 0, 255)
        
        logger.debug(f"Scaled array min/max values: {np.min(scaled_array)}, {np.max(scaled_array)}")
        logger.debug(f"Sample of scaled values: {scaled_array.flatten()[:10]}")
        
        for y in range(28):
            for x in range(28):
                pixel_value = int(scaled_array[y, x])
                pixel_color = (pixel_value, pixel_value, pixel_value)
                for dy in range(10):
                    for dx in range(10):
                        image.putpixel((x * 10 + dx, y * 10 + dy), pixel_color)
        
        logger.debug(f"Final image size: {image.size}")
        return image
        
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        logger.error(f"Image array shape: {image_array.shape if hasattr(image_array, 'shape') else 'no shape'}")
        logger.error(f"Image array type: {type(image_array)}")
        logger.error(f"Image array content: {image_array}")
        raise

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
