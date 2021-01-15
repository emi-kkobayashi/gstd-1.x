/*
 * GStreamer Daemon - gst-launch on steroids
 * Python client library abstracting gstd interprocess communication
 *
 * Copyright (c) 2015-2021 RidgeRun, LLC (http://www.ridgerun.com)
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following
 * disclaimer in the documentation and/or other materials provided
 * with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
 * FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* eslint-disable camelcase */
/* eslint max-len: ["error", { "code": 80 }] */

const Net = require('net')

/**
 * Auxiliar function to close the communications
 * @param {Socket} client TCP socket used for the communications
 * @param {Function} response Callback function used to transmit data
 * @param {*} data Response data loaded to the callback
 * @param {Object} timeout timeout object to clear
 */
function tcpResponseHandler (client, response, data, timeout) {
  if (!client || !response) {
    return
  }

  client.destroy()
  clearTimeout(timeout)
  response(data)
}

/**
 * Implementation of IPC that uses TCP sockets to communicate with Gstd
 * @method send
 */
class Ipc {
  #logger
  #ip
  #port
  #maxsize
  #terminator

  /**
   * Constructor for IPC
   * @param {Object} logger Custom logger where all log messages from this
   * class are going to be reported
   * @param {String} ip The IP where Gstd is running
   * @param {Number} port The port where Gstd is running
   * @param {Number} maxsize Size of the message to read on each iteration
   * @param {String} terminator Message terminator character
   */
  constructor (ip = '127.0.0.1', port = 5000, maxsize = null,
    logger = console, terminator = '\x00'.toString('utf-8')) {
    this.#logger = logger
    this.#ip = ip
    this.#port = port
    this.#maxsize = maxsize
    this.#terminator = terminator
  }

  /**
   * Get the logger object (protected)
   * @returns {Object} logger
   */
  get logger () {
    return this.#logger
  }

  /**
   * Get the current IP address
   * @returns {String} ip address
   */
  get ip () {
    return this.#ip
  }

  /**
   * Get the current tcp port
   * @returns {Number} TCP port
   */
  get port () {
    return this.#port
  }

  /**
   * Get the current size of the message to read on each iteration
   * @returns {Number} size of the message to read
   */
  get maxsize () {
    return this.#maxsize
  }

  /**
   * Get the current Message terminator character
   * @returns {String} Message terminator character
   */
  get terminator () {
    return this.#terminator
  }

  /**
   * Create a socket and sends a message through it
   * <br>
   * @param {String} line Message to send through the socket
   * @param {Number} timeout Timeout in seconds to wait for a response.
   * 0: non-blocking, None: blocking (default)
   * @returns {Promise<String>} Decoded JSON string with the response
   */
  send (line, timeout = 5000) {
    const self = this
    let response = ''
    let timeout_handler = null

    return new Promise((resolve, reject) => {
      const client = new Net.Socket()

      client.connect(this.#port, this.#ip)
      client.write(' ' + line, 'utf8')

      client.on('data', buffer => {
        const incoming_data = buffer.toString('utf-8')

        if (self.maxsize && self.maxsize < response.length) {
          const error = new Error('Server response too long')
          self.logger.error(error.message)
          tcpResponseHandler(client, reject, error, timeout_handler)
        }

        if (incoming_data.includes(self.terminator)) {
          const terminator_idx = incoming_data.indexOf(self.terminator)

          response +=
            incoming_data.toString('utf-8').substring(0, terminator_idx)

          tcpResponseHandler(client, resolve, incoming_data, timeout_handler)
        } else {
          response += incoming_data.toString('utf-8')
        }
      })

      client.on('error', error => {
        self.logger.error(error.message)
        tcpResponseHandler(client, reject, error, timeout_handler)
      })

      timeout_handler = setTimeout(() => {
        const error = new Error('Server took too long to respond')
        self.logger.error(error.message)
        tcpResponseHandler(client, reject, error, null)
      }, timeout)
    })
  }
}

exports.Ipc = Ipc
