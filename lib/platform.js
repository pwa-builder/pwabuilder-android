'use strict';

var path = require('path'),
    util = require('util'),
    Q = require('q'),
    url = require('url'),
    colorNames = require('colornames'),
    DOMParser = require('xmldom').DOMParser;
var pwabuilderLib = require('pwabuilder-lib');

var CustomError = pwabuilderLib.CustomError,
    PlatformBase = pwabuilderLib.PlatformBase,
    manifestTools = pwabuilderLib.manifestTools,
    fileTools = pwabuilderLib.fileTools;

var constants = require('./constants');

var iconSizeMap = {
  '48x48': { density: 'mdpi', type: 'launcher' },
  '72x72': { density: 'hdpi', type: 'launcher' },
  '96x96': { density: 'xhdpi', type: 'launcher' },
  '144x144': { density: 'xxhdpi', type: 'launcher' },
  '192x92': { density: 'xxxhdpi', type: 'launcher' },
  '320x480': { density: 'mdpi', type: 'splash' },
  '480x800': { density: 'hdpi', type: 'splash' },
  '720x1280': { density: 'xhdpi', type: 'splash' },
  '768x1280': { density: 'xhdpi', type: 'splash' },
  '1080x1920': { density: 'xxhdpi', type: 'splash' },
  '1440x2560': { density: 'xxxhdpi', type: 'splash' }
};

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
    var stringsFile = path.join(appResDir, 'values', 'strings.xml');
    var colorsFile = path.join(appResDir, 'values', 'colors.xml');
    
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
        self.debug('Copying project assets...');
        var projectTemplateDir = path.join(self.baseDir, 'template');
        return fileTools.syncFiles(projectTemplateDir, sourceDir, {})
          .catch(function (err) {
            return Q.reject(new CustomError('Failed to copy the project template to the source folder.', err));
          });
      })
      // copy downloaded images to the location of the launch/splash icons 
      .then(function () {
        self.debug('Copying downloaded images...');
          return fileTools.readFolder(imagesDir)
            .then(function (files) {            
              var tasks = files.map(function(file) {
                var size = path.basename(file, path.extname(file));
                var icon = iconSizeMap[size];
                if (icon) {
                  var sourceFile = path.join(imagesDir, file);
                  var targetFile = path.join(appResDir, 'mipmap-' + icon.density, 'ic_' + icon.type + '.png');
                  return fileTools.copyFile(sourceFile, targetFile);
                }
              });

              return tasks.reduce(Q.when, new Q());
            })
            .catch(function (err) {
              if (err.code !== 'ENOENT') {
                return Q.reject(err);
              }
            });
      })
      // update app's name in strings.xml file
      .then(function () {
        self.debug('Updating app\'s name element...');
        return fileTools.readFile(stringsFile, 'utf-8').then(function (xml) {
          var doc = new DOMParser().parseFromString(xml);
          var elements = doc.getElementsByTagName('string');
          for (var i = 0; i < elements.length; i++) {
            if (elements[i].getAttribute('name') === 'app_name' &&
              w3cManifestInfo.content.short_name || w3cManifestInfo.content.name) {
              elements[i].textContent = w3cManifestInfo.content.short_name || w3cManifestInfo.content.name;
            }
          }

          return doc.toString();
        }).then(function (updatedXml) {
          return fileTools.writeFile(stringsFile, updatedXml, 'utf-8');
        }).fail(function (err) {
          return Q.reject(new CustomError('Could not update the strings.xml file', err));
        });
      })
      // update colorPrimary in colors.xml file
      .then(function () {
        self.debug('Updating colorPrimary element...');
        return fileTools.readFile(colorsFile, 'utf-8').then(function (xml) {
          var doc = new DOMParser().parseFromString(xml);
          var elements = doc.getElementsByTagName('color');
          for (var i = 0; i < elements.length; i++) {
            if (elements[i].getAttribute('name') === 'colorPrimary' &&
              w3cManifestInfo.content.theme_color || w3cManifestInfo.content.background_color) {
              var colorCode = w3cManifestInfo.content.theme_color || w3cManifestInfo.content.background_color;
              var colorName = colorNames(colorCode);
              elements[i].textContent = colorName || w3cManifestInfo.content.theme_color || w3cManifestInfo.content.background_color;
            }
          }

          return doc.toString();
        }).then(function (updatedXml) {
          return fileTools.writeFile(colorsFile, updatedXml, 'utf-8');
        }).fail(function (err) {
          return Q.reject(new CustomError('Could not update the strings.xml file', err));
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

    Object.keys(iconSizeMap).forEach(function (size) {
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
   * Receives the size of an icon (e.g. '48x48') and returns the corresponding icon element
   * from the manifest or undefined if not found. The method looks for an icon that:
   * - Has the specified size
   * - Is a PNG icon
   */
  self.getManifestIcon = function (manifest, size) {
    size = size.trim().toLowerCase();
    return (manifest.icons || []).find(function (icon) {
      var extension = path.extname(url.parse(icon.src).pathname);
      return ((extension && (extension.toLowerCase() === '.png') || (icon.type && icon.type.toLowerCase()) === 'image/png')) &&
              !!icon.sizes.split(/\s+/).find(function (iconSize) {
                return iconSize === size;
        });
    });
  };

  self.addManifestIcon = function (manifest, fileName, size) {
    if (!manifest.icons) {
      manifest.icons = [];
    }

    manifest.icons.push({ 'src': fileName, 'sizes': size.toLowerCase().trim()});
  };
}

util.inherits(Platform, PlatformBase);

module.exports = Platform;