import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";

export const runtimeMapping = {
  NODEJS_14_X: Runtime.NODEJS_14_X,
  NODEJS_16_X: Runtime.NODEJS_16_X,
  NODEJS_18_X: Runtime.NODEJS_18_X,
  PYTHON_3_7: Runtime.PYTHON_3_7,
  PYTHON_3_8: Runtime.PYTHON_3_8,
  PYTHON_3_9: Runtime.PYTHON_3_9,
  PYTHON_3_10: Runtime.PYTHON_3_10,
  JAVA_8: Runtime.JAVA_8,
  JAVA_8_CORRETTO: Runtime.JAVA_8_CORRETTO,
  JAVA_11: Runtime.JAVA_11,
  JAVA_17: Runtime.JAVA_17,
  DOTNET_6: Runtime.DOTNET_6,
  GO_1_X: Runtime.GO_1_X,
  RUBY_2_7: Runtime.RUBY_2_7,
  PROVIDED: Runtime.PROVIDED,
  PROVIDED_AL2: Runtime.PROVIDED_AL2,
  FROM_IMAGE: Runtime.FROM_IMAGE,
};

export const architectureMapping = {
  ARM_64: Architecture.ARM_64,
  X86_64: Architecture.X86_64,
};