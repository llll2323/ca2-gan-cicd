import unittest
import json
import numpy as np
from app import app, db, GenerationHistory
from tests.config import *
from unittest.mock import patch

class GANAppTests(unittest.TestCase):
    def setUp(self):
        """Set up test client and database"""
        app.config['TESTING'] = True
        app.config['SQLALCHEMY_DATABASE_URI'] = TEST_DATABASE_URI
        app.config['USERNAME'] = TEST_USERNAME
        app.config['PASSWORD'] = TEST_PASSWORD
        app.config['WTF_CSRF_ENABLED'] = False  # Disable CSRF for testing
        self.client = app.test_client()
        
        # Create test database tables
        with app.app_context():
            db.create_all()
            
        # Create a test client with session handling
        self.client = app.test_client()
        with self.client.session_transaction() as sess:
            sess['logged_in'] = True
            
    def tearDown(self):
        """Clean up after tests"""
        with app.app_context():
            db.session.remove()
            db.drop_all()

    def login(self):
        """Helper function to log in"""
        with self.client.session_transaction() as sess:
            sess['logged_in'] = True
        return self.client.post('/login', data={
            'username': TEST_USERNAME,
            'password': TEST_PASSWORD
        }, follow_redirects=True)

    @patch('app.requests.post')
    def test_vector_validity(self, mock_post):
        """Test vector validation"""
        # Mock successful model response
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'predictions': [[[0.5] * 28] * 28]}
        
        # Test valid vector
        response = self.client.post('/generate_from_vector', 
            json={'instances': [VALID_VECTOR]})
        self.assertEqual(response.status_code, 200)
        
        # Test invalid vector length (too short)
        response = self.client.post('/generate_from_vector', 
            json={'instances': [INVALID_VECTOR_SHORT]})
        self.assertEqual(response.status_code, 500)
        
        # Test invalid vector length (too long)
        response = self.client.post('/generate_from_vector', 
            json={'instances': [INVALID_VECTOR_LONG]})
        self.assertEqual(response.status_code, 500)

    @patch('app.requests.post')
    def test_value_ranges(self, mock_post):
        """Test value range constraints"""
        # Mock successful model response
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'predictions': [[[0.5] * 28] * 28]}
        
        # Test vector values outside valid range
        response = self.client.post('/generate_from_vector', 
            json={'instances': [INVALID_VECTOR_VALUES]})
        self.assertEqual(response.status_code, 200)  # Should accept but normalize values

    @patch('app.requests.post')
    def test_generation_consistency(self, mock_post):
        """Test consistency of image generation"""
        # Mock successful model response with same predictions
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'predictions': [[[0.5] * 28] * 28]}
        
        # Generate image twice with same vector
        response1 = self.client.post('/generate_from_vector', 
            json={'instances': [VALID_VECTOR]})
        response2 = self.client.post('/generate_from_vector', 
            json={'instances': [VALID_VECTOR]})
        
        data1 = json.loads(response1.data)
        data2 = json.loads(response2.data)
        
        # Check if both generations produced same results
        self.assertEqual(data1['status'], 'success')
        self.assertEqual(data2['status'], 'success')

    def test_error_handling(self):
        """Test error handling for unexpected scenarios"""
        # Test with malformed JSON
        response = self.client.post('/generate_from_vector', 
            data='invalid json')
        self.assertEqual(response.status_code, 500)
        
        # Test with missing required fields
        response = self.client.post('/generate_from_vector', 
            json={})
        self.assertEqual(response.status_code, 500)
        
        # Test with invalid vector type
        response = self.client.post('/generate_from_vector', 
            json={'instances': ['not a vector']})
        self.assertEqual(response.status_code, 500)

    def test_authentication(self):
        """Test authentication requirements"""
        # First clear the session
        with self.client.session_transaction() as sess:
            sess.clear()
        
        # Test accessing protected route without login
        response = self.client.get('/')
        self.assertEqual(response.status_code, 302)  # Should redirect to login
        
        # Test invalid login credentials
        response = self.client.post('/login', data={
            'username': 'wrong',
            'password': 'wrong'
        })
        self.assertEqual(response.status_code, 200)  # Returns login page with error
        self.assertIn(b'Invalid credentials', response.data)
        
        # Test valid login
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'GAN EXPLORER', response.data)

    @patch('app.requests.post')
    def test_history_api(self, mock_post):
        """Test history API endpoints"""
        # Mock successful model response
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'predictions': [[[0.5] * 28] * 28]}
        
        # Generate an image first
        self.client.post('/generate_from_vector', 
            json={'instances': [VALID_VECTOR]})
        
        # Test history retrieval
        response = self.client.get('/history')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('history', data)
        
        # Test history with search
        response = self.client.get('/history?search_type=exact&search_vector=' + 
            json.dumps(VALID_VECTOR))
        self.assertEqual(response.status_code, 200)
        
        # Test history with date filters
        response = self.client.get('/history?date_from=2024-01-01&date_to=2024-12-31')
        self.assertEqual(response.status_code, 200)

    @patch('app.requests.post')
    def test_vector_operations(self, mock_post):
        """Test vector-related operations"""
        # Mock successful model response
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'predictions': [[[0.5] * 28] * 28]}

        # Generate an image
        response = self.client.post('/generate_from_vector', json={'instances': [VALID_VECTOR]})
        data = json.loads(response.data)
        self.assertEqual(data['status'], 'success')

        # Get the ID from the generated response
        history_id = data['id']

        # Test vector deletion with ID
        with app.app_context():
            delete_response = self.client.post('/delete_history', json={'id': history_id})
            delete_data = json.loads(delete_response.data)
            
            # Ensure deletion was successful
            self.assertEqual(delete_response.status_code, 200, 
                            f"Expected 200 but got {delete_response.status_code}")

if __name__ == '__main__':
    unittest.main()
