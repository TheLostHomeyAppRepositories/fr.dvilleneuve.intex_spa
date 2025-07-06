'use strict';

const Homey = require('homey');
const uuidv4 = require('uuid').v4;

class IntexDriver extends Homey.Driver {

  async onInit() {
    this.log('IntexDriver has been initialized');
  }

  onPairListDevices(session) {
    this.log(`onPairListDevices called`);

    session.setHandler('list_devices', async (data, tmp) => {
      return Promise.reject(new Error(driver.homey.__('mqtt_client.no_new_devices')));
    });
  }

  onPair(session) {
    this.log(`onPair called`);

    let driver = this;
    let devices = {};
    let selectedDevices = [];
    let pairingTimeout = null;

    session.setHandler('showView', async (viewId) => {
      driver.log(`onPair current phase: "${viewId}"`);

      if (viewId === 'loading2') {
        if (!this.homey.app.clientAvailable) {
          return Promise.reject(new Error(driver.homey.__('mqtt_client.unavailable')));
        }

        this.log("onPairLoading: Searching for devices (ie: waiting for messages from topic 'SpaTiTan/pool/model')");

        // Emit the topic root to the frontend
        session.emit('listen_topic', {
          listenTopic: '/' + this.homey.app.mqttTopicRoot + '/pool/model'
        });

        // Set a timeout for device discovery (5 minutes)
        pairingTimeout = setTimeout(() => {
          driver.log("onPairLoading: Timeout reached - no device discovered within 5 minutes");
          clearInterval(interval);
          
          session.emit('timeout', {
            title: 'Device discovery timeout',
            message: 'No devices were discovered within 1 minute. Please check your network connection and try again.'
          });
          session.done();
        }, 60 * 1000); // 1 minute

        let interval = setInterval((driverArg, sessionArg) => {
          if (this.homey.app.discoveredDevice !== undefined) {
            driverArg.log(`onPairLoading: Discovered device: ${this.homey.app.discoveredDevice}`);

            clearInterval(interval);
            clearTimeout(pairingTimeout);

            devices = driverArg.pairingFinished(this.homey.app.discoveredDevice);

            sessionArg.emit('list_devices', devices, function (error, result) {
              if (result) {
                sessionArg.nextView()
              } else {
                sessionArg.alert('Can not show devices list', null, function () {
                  sessionArg.done()
                });
              }
            });
            sessionArg.nextView();
          }
        }, 2000, driver, session);
      }
    });

    session.setHandler('list_devices', async (data, tmp) => {
      if (devices.length === 0) {
        return Promise.reject(new Error(driver.homey.__('mqtt_client.no_new_devices')));
      }
      driver.log(`list_devices: New devices found: ${JSON.stringify(devices)}`);
      return devices;
    });

    session.setHandler("list_devices_selection", async (devices) => {
      selectedDevices = devices;
    });

    session.setHandler('create_devices', async () => {
      return selectedDevices;
    });

    // Clean up timeout when pairing is cancelled or completed
    session.setHandler('disconnect', () => {
      if (pairingTimeout) {
        clearTimeout(pairingTimeout);
      }
    });
  }

  pairingFinished(discoveredDevice) {
    return [
      {
        name: discoveredDevice,
        data: {
          id: uuidv4(),
        }
      }
    ];
  }

  onMessage(topic, message) {
    let devices = this.getDevices();
    for (const device of devices) {
      device.onMessage(topic, message).catch(this.error);
    }
  }

  sendMessage(topic, payload) {
    this.homey.app.sendMessage(topic, payload);
  }

}

module.exports = IntexDriver;