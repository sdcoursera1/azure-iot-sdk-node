// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Base = require('azure-iot-amqp-base').Amqp;
var endpoint = require('azure-iot-common').endpoint;
var SharedAccessSignature = require('azure-iot-common').SharedAccessSignature;

var UnauthorizedError = require('azure-iot-common').errors.UnauthorizedError;
var DeviceNotFoundError = require('azure-iot-common').errors.DeviceNotFoundError;
var NotConnectedError = require('azure-iot-common').errors.NotConnectedError;

var PackageJson = require('../package.json');
var results = require('azure-iot-common').results;
var translateError = require('./amqp_device_errors.js');
var DeviceMethodClient = require('./amqp_device_method_client.js');
var AmqpReceiver = require('./amqp_receiver.js');

/**
 * @class module:azure-iot-device-amqp.Amqp
 * @classdesc Constructs an {@linkcode Amqp} object that can be used on a device to send
 *            and receive messages to and from an IoT Hub instance, using the AMQP protocol.
 *
 */
/*Codes_SRS_NODE_DEVICE_AMQP_16_001: [The Amqp constructor shall accept a config object with four properties:
host – (string) the fully-qualified DNS hostname of an IoT Hub
hubName - (string) the name of the IoT Hub instance (without suffix such as .azure-devices.net).
deviceId – (string) the identifier of a device registered with the IoT Hub
sharedAccessSignature – (string) the shared access signature associated with the device registration.] */
function Amqp(config) {
  EventEmitter.call(this);
  this._config = config;
  this._initialize();
}

util.inherits(Amqp, EventEmitter);

Amqp.prototype._initialize = function () {
  this._amqp = new Base(false, 'azure-iot-device/' + PackageJson.version);
  this._amqp.setDisconnectHandler(function (err) {
    this.emit('disconnect', err);
  }.bind(this));

  this._deviceMethodClient = new DeviceMethodClient(this._config, this._amqp);
  this._receiver = new AmqpReceiver(this._config, this._amqp, this._deviceMethodClient);
};

var handleResult = function (errorMessage, done) {
  return function (err, result) {
    if (err) {
      done(translateError(errorMessage, err));
    } else {
      done(null, result);
    }
  };
};

var getTranslatedError = function(err, message) {
  if (err instanceof UnauthorizedError || err instanceof NotConnectedError || err instanceof DeviceNotFoundError) {
    return err;
  }
  return translateError(message, err);
};

Amqp.prototype._getConnectionUri = function _getConnectionUri() {
  return 'amqps://' + this._config.host;
};

/**
 * @method              module:azure-iot-device-amqp.Amqp#connect
 * @description         Establishes a connection with the IoT Hub instance.
 * @param {Function}   done   Called when the connection is established of if an error happened.
 *
 */
/*Codes_SRS_NODE_DEVICE_AMQP_16_008: [The done callback method passed in argument shall be called if the connection is established]*/
/*Codes_SRS_NODE_DEVICE_AMQP_16_009: [The done callback method passed in argument shall be called with an error object if the connecion fails]*/
Amqp.prototype.connect = function connect(done) {
  var uri = this._getConnectionUri();
  var sslOptions = this._config.x509;
  this._amqp.connect(uri, sslOptions, function (err, connectResult) {
    if (err) {
      done(translateError('AMQP Transport: Could not connect', err));
    } else {
      if (!sslOptions) {
        /*Codes_SRS_NODE_DEVICE_AMQP_06_005: [If x509 authentication is NOT being utilized then `initializeCBS` shall be invoked.]*/
        this._amqp.initializeCBS(function (err) {
          if (err) {
            /*Codes_SRS_NODE_DEVICE_AMQP_06_008: [If `initializeCBS` is not successful then the client will be disconnected.]*/
            this._amqp.disconnect(function() {
              done(getTranslatedError(err, 'AMQP Transport: Could not initialize CBS'));
            });
          } else {
            /*Codes_SRS_NODE_DEVICE_AMQP_06_006: [If `initializeCBS` is successful, `putToken` shall be invoked If `initializeCBS` is successful, `putToken` shall be invoked with the first parameter audience, created from the sr of the sas signature, the next parameter of the actual sas, and a callback.]*/
            this._amqp.putToken(SharedAccessSignature.parse(this._config.sharedAccessSignature, ['sr', 'sig', 'se']).sr, this._config.sharedAccessSignature, function(err) {
              if (err) {
                /*Codes_SRS_NODE_DEVICE_AMQP_06_009: [If `putToken` is not successful then the client will be disconnected.]*/
                this._amqp.disconnect(function() {
                  done(getTranslatedError(err, 'AMQP Transport: Could not authorize with puttoken'));
                });
              } else {
                done(null, connectResult);
              }
            }.bind(this));
          }
        }.bind(this));
      } else {
        done(null, connectResult);
      }
    }
  }.bind(this));
};

/**
 * @method              module:azure-iot-device-amqp.Amqp#disconnect
 * @description         Disconnects the link to the IoT Hub instance.
 * @param {Function}   done   Called when disconnected of if an error happened.
 */
/*Codes_SRS_NODE_DEVICE_AMQP_16_010: [The done callback method passed in argument shall be called when disconnected]*/
/*Codes_SRS_NODE_DEVICE_AMQP_16_011: [The done callback method passed in argument shall be called with an error object if disconnecting fails]*/
Amqp.prototype.disconnect = function disconnect(done) {
  this._amqp.disconnect(handleResult('AMQP Transport: Could not disconnect', done));
};

/**
 * @method              module:azure-iot-device-amqp.Amqp#sendEvent
 * @description         Sends an event to the IoT Hub.
 * @param {Message}  message    The [message]{@linkcode module:common/message.Message}
 *                              to be sent.
 * @param {Function} done       The callback to be invoked when `sendEvent`
 *                              completes execution.
 */
/* Codes_SRS_NODE_DEVICE_AMQP_16_002: [The sendEvent method shall construct an AMQP request using the message passed in argument as the body of the message.] */
/* Codes_SRS_NODE_DEVICE_AMQP_16_003: [The sendEvent method shall call the done() callback with a null error object and a MessageEnqueued result object when the message has been successfully sent.] */
/* Codes_SRS_NODE_DEVICE_AMQP_16_004: [If sendEvent encounters an error before it can send the request, it shall invoke the done callback function and pass the standard JavaScript Error object with a text description of the error (err.message). ] */
Amqp.prototype.sendEvent = function sendEvent(message, done) {
  var eventEndpoint = endpoint.eventPath(this._config.deviceId);
  this._amqp.send(message, eventEndpoint, eventEndpoint, handleResult('AMQP Transport: Could not send', done));
};

/**
 * @method              module:azure-iot-device-amqp.Amqp#getReceiver
 * @description         Gets the {@linkcode AmqpReceiver} object that can be used to receive messages from the IoT Hub instance and accept/reject/release them.
 * @param {Function}  done      Callback used to return the {@linkcode AmqpReceiver} object.
 */
/* Codes_SRS_NODE_DEVICE_AMQP_16_006: [If a receiver for this endpoint has already been created, the getReceiver method should call the done() method with the existing instance as an argument.]*/
/* Codes_SRS_NODE_DEVICE_AMQP_16_007: [If a receiver for this endpoint doesn’t exist, the getReceiver method should create a new AmqpReceiver object and then call the done() method with the object that was just created as an argument.]*/
Amqp.prototype.getReceiver = function getReceiver(done) {
  done(null, this._receiver);
};

/**
 * @method              module:azure-iot-device-amqp.Amqp#complete
 * @description         Settles the message as complete and calls the done callback with the result.
 *
 * @param {Message}     message     The message to settle as complete.
 * @param {Function}    done        The callback that shall be called with the error or result object.
 */
/*Codes_SRS_NODE_DEVICE_AMQP_16_013: [The ‘complete’ method shall call the ‘complete’ method of the receiver object and pass it the message and the callback given as parameters.] */
Amqp.prototype.complete = function (message, done) {
  this.getReceiver(function (err, receiver) {
    receiver.complete(message, done);
  });
};

/**
 * @method              module:azure-iot-device-amqp.Amqp#reject
 * @description         Settles the message as rejected and calls the done callback with the result.
 *
 * @param {Message}     message     The message to settle as rejected.
 * @param {Function}    done        The callback that shall be called with the error or result object.
 */
/*Codes_SRS_NODE_DEVICE_AMQP_16_014: [The ‘reject’ method shall call the ‘reject’ method of the receiver object and pass it the message and the callback given as parameters.] */
Amqp.prototype.reject = function (message, done) {
  this.getReceiver(function (err, receiver) {
    receiver.reject(message, done);
  });
};

/**
 * @method              module:azure-iot-device-amqp.Amqp#abandon
 * @description         Settles the message as abandoned and calls the done callback with the result.
 *
 * @param {Message}     message     The message to settle as abandoned.
 * @param {Function}    done        The callback that shall be called with the error or result object.
 */
/*Codes_SRS_NODE_DEVICE_AMQP_16_012: [The ‘abandon’ method shall call the ‘abandon’ method of the receiver object and pass it the message and the callback given as parameters.] */
Amqp.prototype.abandon = function (message, done) {
  this.getReceiver(function (err, receiver) {
    receiver.abandon(message, done);
  });
};

/**
 * @method          module:azure-iot-device-amqp.Amqp#updateSharedAccessSignature
 * @description     This methods sets the SAS token used to authenticate with the IoT Hub service.
 *
 * @param {String}        sharedAccessSignature  The new SAS token.
 * @param {Function}      done      The callback to be invoked when `updateSharedAccessSignature` completes.
 */
Amqp.prototype.updateSharedAccessSignature = function (sharedAccessSignature, done) {
  /*Codes_SRS_NODE_DEVICE_AMQP_16_015: [The updateSharedAccessSignature method shall save the new shared access signature given as a parameter to its configuration.] */
  this._config.sharedAccessSignature = sharedAccessSignature;
  /*Codes_SRS_NODE_DEVICE_AMQP_06_010: [The `updateSharedAccessSignature` method shall call the amqp transport `putToken` method with the first parameter audience, created from the sr of the sas signature, the next parameter of the actual sas, and a callback.]*/
  this._amqp.putToken(SharedAccessSignature.parse(this._config.sharedAccessSignature, ['sr', 'sig', 'se']).sr, this._config.sharedAccessSignature, function(err) {
    if (err) {
      this._amqp.disconnect(function() {
        if (done) {
          done(getTranslatedError(err, 'AMQP Transport: Could not authorize with puttoken'));
        }
      });
    } else {
      /*Codes_SRS_NODE_DEVICE_AMQP_06_011: [The `updateSharedAccessSignature` method shall call the `done` callback with a null error object and a SharedAccessSignatureUpdated object as a result, indicating the client does NOT need to reestablish the transport connection.]*/
      if (done) done(null, new results.SharedAccessSignatureUpdated(false));
    }
  }.bind(this));
};

/**
 * @method          module:azure-iot-device-amqp.Amqp#setOptions
 * @description     This methods sets the AMQP specific options of the transport.
 *
 * @param {object}        options   Options to set.  Currently for amqp these are the x509 cert, key, and optional passphrase properties. (All strings)
 * @param {Function}      done      The callback to be invoked when `setOptions` completes.
 */
Amqp.prototype.setOptions = function (options, done) {
/*Codes_SRS_NODE_DEVICE_AMQP_06_001: [The `setOptions` method shall throw a ReferenceError if the `options` parameter has not been supplied.]*/
  if (!options) throw new ReferenceError('The options parameter can not be \'' + options + '\'');
  if (options.hasOwnProperty('cert')) {
    this._config.x509 = {
      cert: options.cert,
      key: options.key,
      passphrase: options.passphrase
    };
  } else if (options.hasOwnProperty('certFile')) {
    this._config.x509 = {
      certFile: options.certFile,
      keyFile: options.keyFile,
    };
  }
  /*Codes_SRS_NODE_DEVICE_AMQP_06_002: [If `done` has been specified the `setOptions` method shall call the `done` callback with no arguments.]*/
  if (done) {
    /*Codes_SRS_NODE_DEVICE_AMQP_06_003: [`setOptions` should not throw if `done` has not been specified.]*/
    done();
  }
};

/**
 * The `sendEventBatch` method sends a list of event messages to the IoT Hub.
 * @param {array<Message>} messages   Array of [Message]{@linkcode module:common/message.Message}
 *                                    objects to be sent as a batch.
 * @param {Function}      done      The callback to be invoked when
 *                                  `sendEventBatch` completes execution.
 */
/* Codes_SRS_NODE_DEVICE_AMQP_16_005: [If sendEventBatch encounters an error before it can send the request, it shall invoke the done callback function and pass the standard JavaScript Error object with a text description of the error (err.message).]  */
//Amqp.prototype.sendEventBatch = function (messages, done) {
// Placeholder - Not implemented yet.
//};

/**
 * The `sendMethodResponse` method sends a direct method response to the IoT Hub
 * @param {Object}     methodResponse   Object describing the device method response.
 * @param {Function}   callback         The callback to be invoked when
 *                                      `sendMethodResponse` completes execution.
 */
Amqp.prototype.sendMethodResponse = function sendMethodResponse(methodResponse, callback) {
  /*Codes_SRS_NODE_DEVICE_AMQP_16_019: [The `sendMethodResponse` shall throw a `ReferenceError` if the `methodResponse` object is falsy.]*/
  if (!methodResponse) {
    throw new ReferenceError('\'methodResponse\' cannot be \'' + methodResponse + '\'');
  }

  /*Codes_SRS_NODE_DEVICE_AMQP_16_020: [The `sendMethodResponse` response shall call the `AmqpDeviceMethodClient.sendMethodResponse` method with the arguments that were given to it.]*/
  this._deviceMethodClient.sendMethodResponse(methodResponse, callback);
};

module.exports = Amqp;