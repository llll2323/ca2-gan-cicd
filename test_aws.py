import boto3
from botocore.exceptions import NoCredentialsError
import os

# AWS Credentials from environment variables
AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_KEY')
AWS_BUCKET_NAME = os.getenv('AWS_BUCKET_NAME')
AWS_REGION = os.getenv('AWS_REGION')

# Initialize S3 Client
s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=AWS_REGION,
)

def upload_test_file():
    try:
        file_name = "test_upload.txt"
        with open(file_name, "w") as f:
            f.write("This is a test file.")

        s3_client.upload_file(file_name, AWS_BUCKET_NAME, "test_upload.txt")

        print(f"✅ File uploaded successfully: https://{AWS_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/test_upload.txt")

    except NoCredentialsError:
        print("❌ AWS Credentials are incorrect!")

upload_test_file()