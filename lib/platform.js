'use strict';

var path = require('path'),
    util = require('util'),
    Q = require('q');

var pwabuilderLib = require('pwabuilder-lib');

var CustomError = pwabuilderLib.CustomError,
    PlatformBase = pwabuilderLib.PlatformBase,
    manifestTools = pwabuilderLib.manifestTools,
    fileTools = pwabuilderLib.fileTools;

var constants = require('./constants');

function Platform (packageName, platforms) {

  var self = this;

  PlatformBase.call(this, constants.platform.id, constants.platform.name, packageName, __dirname);

  // save platform list
  self.platforms = platforms;

  // override create function
  self.create = function (w3cManifestInfo, rootDir, options, callback) {
    if (w3cManifestInfo.format !== pwabuilderLib.constants.BASE_MANIFEST_FORMAT) {
      return Q.reject(new CustomError('The \'' + w3cManifestInfo.format + '\' manifest format is not valid for this platform.'));
    }

    self.info('Generating the ' + constants.platform.name + ' app...');

    var platformDir = self.getOutputFolder(rootDir);
    var sourceDir = path.join(platformDir, 'source');

    // if the platform dir doesn't exist, create it
    self.debug('Creating the ' + constants.platform.name + ' app folder...');
    return fileTools.mkdirp(platformDir)
      // download icons to the app's folder
      .then(function () {
        // TODO
      })
      // copy the documentation
      .then(function () {
        return self.copyDocumentation(platformDir);
      })
      // write generation info (telemetry)
      .then(function () {
        return self.writeGenerationInfo(w3cManifestInfo, platformDir);
      })
      // copy project template to the source folder
      .then(function () {
        var projectTemplateDir = path.join(self.baseDir, 'template');
        return fileTools.copyFolder(projectTemplateDir, sourceDir)
          .catch(function (err) {
            return Q.reject(new CustomError('Failed to copy the project assets to the source folder.', err));
          });
      })
      // persist the platform-specific manifest
      .then(function () {        
        self.debug('Copying the ' + constants.platform.name + ' manifest to the app folder...');
        var manifestDir = path.join(sourceDir, 'app', 'src', 'main', 'assets');
        return fileTools.mkdirp(manifestDir)
          .then(function () {
            var manifestFilePath = path.join(manifestDir, 'manifest.json');
            return manifestTools.writeToFile(w3cManifestInfo, manifestFilePath);
          });
      })
      .nodeify(callback);
  };
}

util.inherits(Platform, PlatformBase);

module.exports = Platform;