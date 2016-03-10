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
    this.dirty_check_interval = config.options.dirty_check_interval || 10000;

    this.cache = new NodeCache({ stdTTL: this.cache_timeout });

    this.dirty_check();
}

FSClient.prototype.sync = function () {
    var endpoint = 'features';
    var self = this;

    return new Promise(function(resolve) {
        api_get(self, endpoint)
        .then(function(result) {
            if (result instanceof Error) {
                resolve(result);
            } else {
                self.last_update = result.last_update;

                result.features.forEach(function(item) {
                    self.cache.set(item.feature_key, item);
                });

                resolve(true);
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
            if (result instanceof Error) {
                resolve(result);
            } else {
                if (result.success) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            }
        });
    });
};

FSClient.prototype.is_enabled = function (feature_key, user_identifier) {
    var self = this;

    user_identifier = user_identifier || null;

    var feature = self.cache.get(feature_key);
    if (feature == undefined) {
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
            console.log("Remote Last Updated " + result.last_update + ", Local Last Updated " + self.last_update);
            if (result.last_update > self.last_update) {
                console.log("Dirty, syncing...");
                self.sync()
                    .then(function(result) {
                        setTimeout(function() {
                            self.dirty_check();
                        }, self.dirty_check_interval);
                    });
            } else {
                setTimeout(function() {
                    self.dirty_check();
                }, self.dirty_check_interval);
            }
        });
}

function get_feature(self, feature_key, user_identifier) {
    var endpoint = 'feature';
    var user_identifier = user_identifier || null;
    var payload = {feature_key: feature_key};

    return new Promise(function(resolve) {
        api_get(self, endpoint, payload)
            .then(function(result) {
                if (result instanceof Error) {
                    resolve(result);
                } else {
                    self.cache.set(feature_key, result);
                    if (result.enabled && user_identifier) {
                        resolve(enabled_for_user(result, user_identifier));
                    } else if (!user_identifier && (feature.include_users.length > 0 || feature.exclude_users.length > 0)){
                        resolve(false);
                    } else {
                        resolve(result.enabled);
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
        rest.get(API + endpoint, options).on('complete', function(result) {
            if (result instanceof Error) {
                resolve(new Error('Error communicating with FeatureSwitches'));
            } else {
                resolve(result);
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
        rest.post(API + endpoint, options).on('complete', function(result) {
            if (result instanceof Error) {
                resolve(new Error('Error communicating with FeatureSwitches'));
            } else {
                resolve(result);
            }
        });
    });
}

module.exports = FSClient;
