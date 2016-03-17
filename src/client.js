'use strict';

var assert = require('assert');
var rest = require('restler');
var Promise = require('bluebird');
var NodeCache = require('node-cache');

var API = process.env.API || 'https://api.featureswitches.com/v1/';

function FSClient (config) {
    config = config || {};
    assert(this instanceof FSClient, 'Client must be called with new.');

    this.customer_key = config.customer_key || process.env.CUSTOMER_API_KEY;
    assert(!!this.customer_key, 'A customer API key is required.');
    this.environment_key = config.environment_key || process.env.ENVIRONMENT_API_KEY;
    assert(!!this.environment_key, 'An environment API key is required.');

    this.cache_timeout = config.options.cache_timeout || 300;
    this.last_update = 0;
    this.check_interval = config.options.check_interval * 1000 || 10000;

    this.cache = new NodeCache({ stdTTL: 0 });

    this.last_dirty_check = 0;
    this.dirty_check();
}

FSClient.prototype.authenticate = function () {
    var endpoint = 'authenticate';
    var self = this;

    return new Promise(function(resolve) {
        api_get(self, endpoint)
        .then(function(result) {
            if (!result.success) {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
};

FSClient.prototype.sync = function () {
    var endpoint = 'features';
    var self = this;

    return new Promise(function(resolve) {
        api_get(self, endpoint)
        .then(function(result) {
            if (!result.success) {
                resolve(result);
            } else {
                var data = result.data;
                self.last_update = data.last_update;

                data.features.forEach(function(item) {
                    item.last_sync = parseInt(Date.now() / 1000);
                    self.cache.set(item.feature_key, item);
                });

                var response = {
                    success: true,
                }
                resolve(response);
            }
        });
    });
};

FSClient.prototype.add_user = function (user_identifier, customer_identifier, name, email) {
    var endpoint = 'user/add';
    var self = this;

    var payload = {
        user_identifier: user_identifier,
        customer_identifier: customer_identifier || null,
        name: name || null,
        email: email || null
    }

    return new Promise(function(resolve) {
        api_post(self, endpoint, payload)
        .then(function(result) {
            resolve(result);
        });
    });
};

FSClient.prototype.is_enabled = function (feature_key, user_identifier) {
    var self = this;

    user_identifier = user_identifier || null;

    var feature = self.cache.get(feature_key);
    if (feature == undefined || self.cache_is_stale(feature)) {
        return new Promise(function(resolve) {
            get_feature(self, feature_key, user_identifier)
                .then(function(result) {
                    resolve(result);
                });
        });
    } else {
        return new Promise(function(resolve) {
            if (feature.enabled && user_identifier) {
                resolve(enabled_for_user(feature, user_identifier));
            } else if (!user_identifier && (feature.include_users.length > 0 || feature.exclude_users.length > 0)){
                resolve(false);
            } else {
                resolve(feature.enabled);
            }
        });
    }
}

FSClient.prototype.dirty_check = function () {
    var endpoint = 'dirty-check';
    var self = this;

    api_get(self, endpoint)
        .then(function(result) {
            // Set a timestamp for the last dirty_check
            if (result.success) {
                self.last_dirty_check = parseInt(Date.now() / 1000);
            }

            var data = result.data;

            if (data && data.last_update > self.last_update) {
                self.sync()
                    .then(function(result) {
                        setTimeout(function() {
                            self.dirty_check();
                        }, self.check_interval);
                    });
            } else {
                setTimeout(function() {
                    self.dirty_check();
                }, self.check_interval);
            }
        });
}

FSClient.prototype.cache_is_stale = function (feature) {
    var timeout = parseInt(Date.now() / 1000) - this.cache_timeout;

    if (feature.last_sync > timeout && this.last_dirty_check > timeout)
        return false;
    if (this.last_dirty_check < timeout)
        return true;
    return false;
};

function get_feature(self, feature_key, user_identifier) {
    var endpoint = 'feature';
    var user_identifier = user_identifier || null;
    var payload = {feature_key: feature_key};

    return new Promise(function(resolve) {
        api_get(self, endpoint, payload)
            .then(function(result) {
                if (!result.success) {
                    resolve(result);
                } else {
                    var feature = result.data;
                    feature.last_sync = parseInt(Date.now() / 1000);
                    self.cache.set(feature_key, feature);
                    if (result.data.enabled && user_identifier) {
                        resolve(enabled_for_user(result.data, user_identifier));
                    } else if (!user_identifier && (result.data.feature.include_users.length > 0 || result.data.feature.exclude_users.length > 0)){
                        resolve(false);
                    } else {
                        resolve(result.data.enabled);
                    }
                }
            });
    });
}

function enabled_for_user(feature, user_identifier) {
    if (feature.include_users.length > 0 && feature.include_users.indexOf(user_identifier) > -1) {
        return true;
    } else if (feature.exclude_users > 0 && feature.exclude_users.indexOf(user_identifier) > -1) {
        return false;
    }

    return feature.enabled;
}


function api_get(self, endpoint, payload) {
    var options = {
        headers: {
            Authorization: self.customer_key + ":" + self.environment_key
        },
        query: payload || {}
    }

    return new Promise(function(resolve) {
        rest.get(API + endpoint, options).on('complete', function(data, result) {
            if (!result || result instanceof Error) {
                var response = {
                    success: false,
                    message: 'Error communicating with FeatureSwitches',
                    statusCode: -1
                }
                resolve(response);
            } else {
                if (result.statusCode !== 200) {
                    var response = {
                        success: false,
                        message: data.message,
                        statusCode: result.statusCode
                    }

                    resolve(response);
                } else {
                    var response = {
                        success: true,
                        message: '',
                        data: data
                    }
                    resolve(response);
                } 
            }
        });
    });
}

function api_post(self, endpoint, payload) {
    var options = {
        headers: {
            Authorization: self.customer_key + ":" + self.environment_key
        },
        data: payload || {}
    }

    return new Promise(function(resolve) {
        rest.post(API + endpoint, options).on('complete', function(data, result) {
            if (result instanceof Error) {
                var response = {
                    success: false,
                    message: 'Error communicating with FeatureSwitches',
                    statusCode: -1
                }
                resolve(response);
            } else {
                if (result.statusCode !== 200) {
                    var response = {
                        success: false,
                        message: data.message,
                        statusCode: result.statusCode
                    }
                    resolve(response);
                } else {
                    var response = {
                        success: true,
                        message: '',
                        data: data
                    }
                    resolve(response);
                }
            }
        });
    });
}

module.exports = FSClient;
