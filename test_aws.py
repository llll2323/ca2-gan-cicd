import boto3
from botocore.exceptions import NoCredentialsError

# AWS Credentials
AWS_ACCESS_KEY = "AKIAR7HWXWAEDIUD7CA6"
AWS_SECRET_KEY = "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"
BUCKET_NAME = "gan-images-bucket"
REGION_NAME = "ap-southeast-1"

# Initialize S3 Client
s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=REGION_NAME,
)

def upload_test_file():
    try:
        file_name = "test_upload.txt"
        with open(file_name, "w") as f:
            f.write("This is a test file.")

        s3_client.upload_file(file_name, BUCKET_NAME, "test_upload.txt")

        print(f"✅ File uploaded successfully: https://{BUCKET_NAME}.s3.{REGION_NAME}.amazonaws.com/test_upload.txt")

    except NoCredentialsError:
        print("❌ AWS Credentials are incorrect!")

upload_test_file()