"""Test configuration file"""

# Test database URI (use a separate test database)
TEST_DATABASE_URI = "mysql+pymysql://avnadmin:AVNS_BEmbjqYE2EpS34WfDDQ@mysql-2b7479e9-ca2-gan.i.aivencloud.com:15217/testdb?ssl={'ssl': True}"

# Test credentials
TEST_USERNAME = "admin"
TEST_PASSWORD = "password123"

# Test vector data
VALID_VECTOR = [0.1] * 100  # Valid 100-dimensional vector
INVALID_VECTOR_SHORT = [0.1] * 99  # Invalid 99-dimensional vector
INVALID_VECTOR_LONG = [0.1] * 101  # Invalid 101-dimensional vector
INVALID_VECTOR_VALUES = [2.0] * 100  # Invalid values outside [-1, 1] range

# Model endpoint for testing
TEST_MODEL_URL = "https://ca2-daaa2b04-2317748-lixiangong.onrender.com/v1/models/generator:predict" 