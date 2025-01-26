import pytest
import requests
import json
import numpy as np

# Server URL for GAN model 
#GAN_URL = "http://localhost:8501/v1/models/generator:predict"
GAN_URL = "https://ca2-daaa2b04-2317748-lixiangong.onrender.com/v1/models/generator:predict"

# Helper functions --------------------------------------------------
def generate_latent_vectors(num_samples, latent_dim):
    """Generate random latent vectors for GAN input"""
    return np.random.randn(num_samples, latent_dim).astype('float32')

def make_gan_prediction(latent_vectors):
    """Send prediction request to GAN model server"""
    data = json.dumps({
        "signature_name": "serving_default",
        "instances": latent_vectors.tolist()
    })
    headers = {"content-type": "application/json"}
    response = requests.post(GAN_URL, data=data, headers=headers)
    return json.loads(response.text)['predictions']

# Tests -------------------------------------------------------------
def test_output_validity():
    """Validity Testing: Check output structure and dimensions"""
    latent_vectors = generate_latent_vectors(num_samples=2, latent_dim=100)
    predictions = make_gan_prediction(latent_vectors)
    
    # Check output is list of 2 images (one per sample)
    assert isinstance(predictions, list)
    assert len(predictions) == 2
    
    # Check each image has correct dimensions (28x28x1 for MNIST-like)
    for image in predictions:
        assert len(image) == 28  # 28 rows
        assert len(image[0]) == 28  # 28 columns
        assert len(image[0][0]) == 1  # 1 channel (grayscale)

def test_pixel_range():
    """Range Testing: Ensure pixel values are in [-1, 1]"""
    latent_vectors = generate_latent_vectors(num_samples=1, latent_dim=100)
    predictions = make_gan_prediction(latent_vectors)
    
    # Flatten all pixels from first image
    pixels = [pixel for row in predictions[0] for pixel_row in row for pixel in pixel_row]
    
    # Check value range (GANs typically use tanh activation)
    assert all(-1 <= pixel <= 1 for pixel in pixels)

def test_invalid_input_handling():
    """Unexpected Failure Testing: Reject malformed inputs"""
    # Test 1: Send string instead of numbers
    invalid_data = {"signature_name": "serving_default", "instances": [["abc"]]}
    response = requests.post(GAN_URL, json=invalid_data)
    assert response.status_code == 400  # Expect HTTP 400 error
    
    # Test 2: Incorrect latent vector dimension
    invalid_latent = generate_latent_vectors(num_samples=1, latent_dim=50).tolist()
    response = requests.post(GAN_URL, json={"signature_name": "serving_default", "instances": invalid_latent})
    assert response.status_code == 400

# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])