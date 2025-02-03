from flask import Flask, render_template, request, jsonify
import requests
import numpy as np

app = Flask(__name__)

MODEL_URL = "https://ca2-daaa2b04-2317748-lixiangong.onrender.com/v1/models/generator:predict"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate', methods=['POST'])
def generate():
    try:
        # Generate random vector (96 dimensions)
        vector = np.random.uniform(-1, 1, 96).tolist()
        
        # Prepare the request payload
        payload = {
            "signature_name": "serving_default",
            "instances": [vector]
        }
        
        # Make request to model
        response = requests.post(MODEL_URL, json=payload)
        
        if response.status_code == 200:
            # Process the generated image data
            result = response.json()
            # We'll need to process the image data for display
            return jsonify({
                'status': 'success',
                'vector': vector,
                'image': result['predictions']
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Model request failed'
            }), 500
            
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)