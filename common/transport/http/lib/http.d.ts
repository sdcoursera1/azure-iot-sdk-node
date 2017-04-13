/// <reference types="node" />
import { ClientRequest, IncomingMessage } from 'http';
import { Message, X509 } from 'azure-iot-common';
export declare type HttpCallback = (err: Error, body?: string, response?: IncomingMessage) => void;
/**
 * @class           module:azure-iot-http-base.Http
 * @classdesc       Basic HTTP request/response functionality used by higher-level IoT Hub libraries.
 *                  You generally want to use these higher-level objects (such as [azure-iot-device-http.Http]{@link module:azure-iot-device-http.Http}) rather than this one.
 */
export declare class Http {
    /**
     * @method              module:azure-iot-http-base.Http.buildRequest
     * @description         Builds an HTTP request object using the parameters supplied by the caller.
     *
     * @param {String}      method          The HTTP verb to use (GET, POST, PUT, DELETE...).
     * @param {String}      path            The section of the URI that should be appended after the hostname.
     * @param {Object}      httpHeaders     An object containing the headers that should be used for the request.
     * @param {String}      host            Fully-Qualified Domain Name of the server to which the request should be sent to.
     * @param {Function}    done            The callback to call when a response or an error is received.
     *
     * @returns An HTTP request object.
     */
    buildRequest(method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT' | 'OPTIONS' | 'TRACE', path: string, httpHeaders: {
        [key: string]: string | string[] | number;
    }, host: string, x509Options: X509 | HttpCallback, done?: HttpCallback): ClientRequest;
    /**
     * @method                              module:azure-iot-http-base.Http.toMessage
     * @description                         Transforms the body of an HTTP response into a {@link module:azure-iot-common.Message} that can be treated by the client.
     *
     * @param {module:http.IncomingMessage} response        A response as returned from the node.js http module
     * @param {Object}                      body            The section of the URI that should be appended after the hostname.
     *
     * @returns {module:azure-iot-common.Message} A Message object.
     */
    toMessage(response: IncomingMessage, body: Message.BufferConvertible): Message;
    /**
     * @method              module:azure-iot-http-base.Http#parseErrorBody
     * @description         Parses the body of an error response and returns it as an object.
     *
     * @params {String}     body  The body of the HTTP error response
     * @returns {Object}    An object with 2 properties: code and message.
     */
    static parseErrorBody(body: string): {
        code: string;
        message: string;
    };
}
