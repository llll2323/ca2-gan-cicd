FROM tensorflow/serving

# Copy model directory to /models/gan_generator
COPY /ai_model/generator /models/generator

# Set environment variables
ENV MODEL_NAME=generator
ENV MODEL_BASE_PATH=/models/generator

# Expose ports for REST API and gRPC
EXPOSE 8500
EXPOSE 8501

# Create custom entrypoint script for TensorFlow Serving
RUN echo '#!/bin/bash \n\n\
tensorflow_model_server \
--rest_api_port=$PORT \
--model_name=${MODEL_NAME} \
--model_base_path=${MODEL_BASE_PATH}/${MODEL_NAME} \
"$@"' > /usr/bin/tf_serving_entrypoint.sh \
&& chmod +x /usr/bin/tf_serving_entrypoint.sh

# Use the custom entrypoint
ENTRYPOINT ["/usr/bin/tf_serving_entrypoint.sh"]
