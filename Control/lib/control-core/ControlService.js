/**
 * @license
 * Copyright 2019-2020 CERN and copyright holders of ALICE O2.
 * See http://alice-o2.web.cern.ch/copyright for details of the copyright holders.
 * All rights not expressly granted are reserved.
 *
 * This software is distributed under the terms of the GNU General Public
 * License v3 (GPL Version 3), copied verbatim in the file "COPYING".
 *
 * In applying this license CERN does not waive the privileges and immunities
 * granted to it by virtue of its status as an Intergovernmental Organization
 * or submit itself to any jurisdiction.
*/

const assert = require('assert');
const path = require('path');
const {WebSocketMessage, Log} = require('@aliceo2/web-ui');
const log = new Log(`${process.env.npm_config_log_label ?? 'cog'}/controlservice`);
const {errorHandler, errorLogger} = require('./../utils.js');
const CoreUtils = require('./CoreUtils.js');

/**
 * Gateway for all AliECS - Core calls
 */
class ControlService {
  /**
   * Constructor initializing dependencies
   * @param {Padlock} padLock
   * @param {GrpcProxy} ctrlProx
   * @param {WebSocket} webSocket
   * @param {ConsulConnector} consulConnector
   * * @param {JSON} coreConfig
   */
  constructor(padLock, ctrlProx, consulConnector, coreConfig) {
    assert(padLock, 'Missing PadLock dependency');
    assert(ctrlProx, 'Missing GrpcProxy dependency for AliECS');
    this.padLock = padLock;
    this.ctrlProx = ctrlProx;
    this.consulConnector = consulConnector;
    this.coreConfig = coreConfig;
  }

  /**
   * Set websocket after server initialization
   * @param {WebSocket} webSocket 
   */
  setWS(webSocket) {
    this.webSocket = webSocket;
  }

  /**
   * Method to handle the request of cleaning O2 resources
   * * subscribes and listens to AliECS stream with channelId so that updates
   * are sent via WebSocket
   * * requests the creation of a new auto env
   * * replies to the initial request of clean
   * @param {Request} req 
   * @param {Response} res 
   */
  async cleanResources(req, res) {
    const channelId = req.body.channelId;
    const method = 'NewAutoEnvironment';
    try {
      const hosts = await this.consulConnector.getFLPsList();
      const {repos: repositories} = await this.ctrlProx['ListRepos']();
      const {name: repositoryName, defaultRevision} = repositories.find((repository) => repository.default);
      const cleanChanel = this.ctrlProx.client['Subscribe']({id: channelId})
      cleanChanel.on('data', (data) => this.onData(channelId, 'clean-resources-action', data));
      cleanChanel.on('error', (err) => this.onError(channelId, 'clean-resources-action', err));
      // onEnd gets called no matter what
      // cleanChanel.on('end', () => this.onEnd(channelId));

      // Make request to clear resources
      const coreConf = {
        id: channelId,
        vars: {hosts: JSON.stringify(hosts)},
        workflowTemplate: path.join(repositoryName, `workflows/resources-cleanup@${defaultRevision}`)
      };
      await this.ctrlProx[method](coreConf);
      res.status(200).json({
        ended: false, success: true, id: channelId,
        info: {message: 'Request for "Cleaning Resources" was successfully sent and in progress'}
      })
    } catch (error) {
      // Failed to getFLPs, ListRepos or NewAutoEnvironment
      errorLogger(error);
      res.status(502).json({
        ended: true, success: false, id: channelId,
        message: 'Error while attempting to clean resources ...',
        info: {message: error.message || error || 'Error while attempting to clean resources ...'}
      });
    }
  }

  /**
   * Method to handle the request of creating a new Auto Environment
   * * subscribes and listens to AliECS stream with channelId so that updates
   * are sent via WebSocket
   * * requests the creation of a new auto env
   * * replies to the initial request
   * @param {Request} req
   * @param {Response} res
   */
  async createAutoEnvironment(req, res) {
    const channelId = req.body.channelId;
    const hosts = req.body.hosts;
    const method = 'NewAutoEnvironment';
    if (!channelId) {
      res.status(502).json({
        ended: true, success: false, id: channelId,
        message: 'Channel ID should be provided'
      });
    } else if (!hosts || hosts.length === 0) {
      res.status(502).json({
        ended: true, success: false, id: channelId,
        message: 'List of Hosts should be provided'
      });
    } else {
      const operation = 'o2-roc-config';
      try {
        const {repos: repositories} = await this.ctrlProx['ListRepos']();
        const {name: repositoryName, defaultRevision} = repositories.find((repository) => repository.default);
        if (!defaultRevision) {
          throw new Error(`Unable to find a default revision for repository: ${repositoryName}`);
        }

        // Setup Stream Channel
        const cleanChanel = this.ctrlProx.client['Subscribe']({id: channelId})
        cleanChanel.on('data', (data) => this.onData(channelId, operation, data));
        cleanChanel.on('error', (err) => this.onError(channelId, operation, err));
        // onEnd gets called no matter what
        // cleanChanel.on('end', () => this.onEnd(channelId));

        // Make request to clear resources
        const coreConf = {
          id: channelId,
          vars: {hosts: JSON.stringify(hosts)},
          workflowTemplate: path.join(repositoryName, `workflows/${operation}@${defaultRevision}`),
        };
        await this.ctrlProx[method](coreConf);
        res.status(200).json({
          ended: false, success: true, id: channelId,
          info: {message: 'Request for "o2-roc-config" was successfully sent and is now in progress'}
        })
      } catch (error) {
        // Failed to getFLPs, ListRepos or NewAutoEnvironment
        errorLogger(error);
        res.status(502).json({
          ended: true, success: false, id: channelId,
          message: error.message || error || 'Error while attempting to run o2-roc-config ...',
          info: {message: error.message || error || 'Error while attempting to run o2-roc-config ...'}
        });
      }
    }
  }

  /**
   * Method to execute command contained by req.path and send back results
   * @param {Request} req
   * @param {Response} res
   */
  executeCommand(req, res) {
    const method = CoreUtils.parseMethodNameString(req.path);
    this.ctrlProx[method](req.body)
      .then((response) => res.json(response))
      .catch((error) => errorHandler(error, res, 504));
  }

  /**
   * Method to execute specified command return results
   * @return {Promise}
   */
  async getAliECSInfo() {
    const method = CoreUtils.parseMethodNameString('GetFrameworkInfo');
    const response = await this.ctrlProx[method]();
    response.version = CoreUtils.parseAliEcsVersion(response.version);
    return response;
  }

  /**
   * Request information about the integrated services from AliECS Core
   * @return {Promise}
   */
  async getIntegratedServicesInfo() {
    const method = CoreUtils.parseMethodNameString('GetIntegratedServices');
    const response = await this.ctrlProx[method]();
    return response;
  }

  /**
   * Middleware method to check if AliECS connection is up and running
   * @param {Request} req
   * @param {Response} res
   * @param {Next} next
   * @return {boolean}
   */
  isConnectionReady(_, res, next) {
    if (!this.ctrlProx?.isConnectionReady) {
      let error = 'Could not establish connection to AliECS Core';
      if (this.ctrlProx.connectionError?.message) {
        error = this.ctrlProx.connectionError.message;
      }
      errorHandler(error, res, 503);
    } else {
      next();
    }
  }

  /**
   * Middleware method to check if lock is needed and if yes if it is acquired
   * @param {Request} req
   * @param {Response} res
   * @param {Next} next
   * @return {boolean}
   */
  isLockSetUp(req, res, next) {
    const method = CoreUtils.parseMethodNameString(req.path);
    // disallow 'not-Get' methods if not owning the lock
    if (!method.startsWith('Get') && method !== 'ListRepos') {
      if (this.padLock.lockedBy == null) {
        errorHandler(`Control is not locked`, res, 403);
        return;
      } else if (req.session.personid != this.padLock.lockedBy) {
        errorHandler(`Control is locked by ${this.padLock.lockedByName}`, res, 403);
        return;
      }
    }
    next();
  }

  /**
   * Middleware method to log the action and id of the user
   * @param {Request} req
   * @param {Response} res
   * @param {Next} next
   */
  logAction(req, _, next) {
    const method = CoreUtils.parseMethodNameString(req.path);
    if (!method.startsWith('Get')) {
      const type = req.body.type ? ` (${req.body.type})` : '';
      log.info(`${req.session.personid} => ${method} ${type}`, 6);
    }
    next();
  }

  /**
   * Helpers
   */

  /**
   * Deal with incoming message from AliECS Core Stream
   * Method will react only to messages that contain an EnvironmentEvent
   * @param {string} channelId - to distinguish to which client should this message be sent
   * @param {string} command
   * @param {Event} data - AliECS Event (proto)
   */
  onData(channelId, command, data) {
    if (data.taskEvent && data.taskEvent.status === 'TASK_FAILED') {
      const msg = new WebSocketMessage();
      msg.command = command;
      msg.payload = {
        ended: false, success: false, id: channelId, type: 'TASK',
        info: {host: data.taskEvent.hostname, id: data.taskEvent.taskid},
      };
      this.webSocket.broadcast(msg);
    }
    if (data.environmentEvent) {
      const msg = new WebSocketMessage();
      msg.command = command;

      if (!data.environmentEvent.error) {
        msg.payload = {
          ended: data.environmentEvent.state === 'DONE' ? true : false,
          success: true, id: channelId, type: 'ENV',
          info: {message: data.environmentEvent.message || 'Executing ...'}
        };
      } else {
        msg.payload = {
          ended: true, success: false, id: channelId, type: 'ENV',
          info: {message: data.environmentEvent.error || `Failed operation: ${command} ...`}
        };
      }
      this.webSocket.broadcast(msg);
    }
  }

  /**
   * Deal with incoming error message from AliECS Core Stream
   * @param {string} channelId - to distinguish to which client should this message be sent
   */
  onError(channelId, command, error) {
    const msg = new WebSocketMessage();
    msg.command = command;
    msg.payload = {
      ended: true, success: false, id: channelId,
      info: {message: `"${command}" action failed due to ${error.toString()}`}
    };
    errorLogger(error);
    this.webSocket.broadcast(msg);
  }
}

module.exports = ControlService;
