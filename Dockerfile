FROM tensorflow/serving

# Copy model directory directly to /models/generator/1
COPY ai_model/gan_generator/1 /models/generator/1

# Set environment variables
ENV MODEL_NAME=generator
ENV MODEL_BASE_PATH=/models/generator

# Expose ports for REST API and gRPC
EXPOSE 8500
EXPOSE 8501

# Create custom entrypoint script for TensorFlow Serving
RUN echo '#!/bin/bash \n\n\
tensorflow_model_server \
--rest_api_port=8501 \
--model_name=${MODEL_NAME} \
--model_base_path=${MODEL_BASE_PATH} \
"$@"' > /usr/bin/tf_serving_entrypoint.sh \
&& chmod +x /usr/bin/tf_serving_entrypoint.sh

# Use the custom entrypoint
ENTRYPOINT ["/usr/bin/tf_serving_entrypoint.sh"]