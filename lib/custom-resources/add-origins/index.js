const response = require('cfn-response')

exports.handler = async (event, context) => {
  console.log(event);
  try {

    switch (event.RequestType) {
      case 'Create':
        await createResource(event, context);
        break;
      case 'Delete':
        await deleteResource(event, context);
        break;
      default:
        throw new Error('Event not handled');
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      response.send(event, context, 'FAILED', { message: error.message });
    } else {
      response.send(event, context, 'FAILED', error);
    }
  }
};

const createResource = async (event, context, params) => {
  // const result = await locationService.putGeofence(params).promise();
  // console.info(result);

  response.send(event, context, 'SUCCESS', {
    // GeofenceId: result.GeofenceId,
  });
};

const deleteResource = async (event, context, params) => {
  // const result = await locationService
  //   .batchDeleteGeofence({
  //     CollectionName: params.CollectionName,
  //     GeofenceIds: [params.GeofenceId],
  //   })
  //   .promise();
  // console.info(result);

  response.send(event, context, 'SUCCESS', {});
};
