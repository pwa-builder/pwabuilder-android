'use strict';

var path = require('path'),
    util = require('util'),
    Q = require('q'),
    fs = require('fs'),
    url = require('url');

var pwabuilderLib = require('pwabuilder-lib');

var CustomError = pwabuilderLib.CustomError,
    PlatformBase = pwabuilderLib.PlatformBase,
    manifestTools = pwabuilderLib.manifestTools,
    fileTools = pwabuilderLib.fileTools;

var constants = require('./constants');

var iconSizeToDensityMap = {
  48: 'mdpi',
  72: 'hdpi',
  96: 'xhdpi',
  144: 'xxhdpi',
  192: 'xxxhdpi'
}

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
    var imagesDir = path.join(platformDir, 'images');
    var appResDir = path.join(sourceDir, 'app', 'src', 'main', 'res');

    // if the platform dir doesn't exist, create it
    self.debug('Creating the ' + constants.platform.name + ' app folder...');
    return fileTools.mkdirp(platformDir)
      // download manifest icons to the app's folder
      .then(function () {
        return self.downloadIcons(w3cManifestInfo.content, w3cManifestInfo.content.start_url, imagesDir);
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
      // copy downloaded images to the location of the launch icons 
      .then(function () {
          return fs.existsSync(imagesDir) && fileTools.readFolder(imagesDir)
            .then(function (files) {            
              files.forEach(function(file) {
                var size = path.basename(file, path.extname(file));
                var sourceFile = path.join(imagesDir, file);
                var targetFile = path.join(appResDir, 'mipmap-' + iconSizeToDensityMap[size], 'ic_launcher.png');
                return fs.writeFileSync(targetFile, fs.readFileSync(sourceFile));
              });
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

  self.getManifestIcons = function (manifest) {
    var manifestIcons = [];

    Object.keys(iconSizeToDensityMap).forEach(function (size) {
      var icon = self.getManifestIcon(manifest, size);
      if (!!icon) {
        manifestIcons.push({
          fileName: size + '.png',
          url: icon.src
        });
      }
    });

    return manifestIcons;
  };

  /**
   * Receives the size of a square icon (e.g. '48') and returns the corresponding icon element
   * from the manifest or undefined if not found. The method looks for an icon that:
   * - Is square and has the specified size
   * - Has a specific extension or image type
   */
  self.getManifestIcon = function (manifest, size) {
    size = size.trim().toLowerCase();
    return (manifest.icons || []).find(function (icon) {
      var extension = path.extname(url.parse(icon.src).pathname);
      return ((extension && (extension.toLowerCase() === '.png') || (icon.type && icon.type.toLowerCase()) === 'image/png')) &&
              !!icon.sizes.split(/\s+/).find(function (iconSize) {
                var dimensions = iconSize.toLowerCase().split('x');
                return dimensions.length === 2 && dimensions[0] === size && dimensions[1] === size;
        });
    });
  };
}

util.inherits(Platform, PlatformBase);

module.exports = Platform;