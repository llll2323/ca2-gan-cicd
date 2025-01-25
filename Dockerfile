FROM tensorflow/serving

# Copy model files directly from ./generator to TF Serving's expected path
# Creates: /models/generator/1/saved_model.pb
COPY ./generator /models/generator/1/

# Environment variables
ENV MODEL_NAME=generator \
    MODEL_BASE_PATH=/models

EXPOSE 8500 8501

# Entrypoint script (unchanged)
RUN echo '#!/bin/bash \n\n\
tensorflow_model_server \
--rest_api_port=8501 \
--model_name=${MODEL_NAME} \
--model_base_path=${MODEL_BASE_PATH}/${MODEL_NAME} \
"$@"' > /usr/bin/tf_serving_entrypoint.sh \
&& chmod +x /usr/bin/tf_serving_entrypoint.sh

ENTRYPOINT ["/usr/bin/tf_serving_entrypoint.sh"]