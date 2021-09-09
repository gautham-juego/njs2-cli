#!/usr/bin/env node
const tar = require("tar");
const fs = require("fs");
const child_process = require("child_process");
let request = require('request');
const path = require('path');
const { validatePackageVersion } = require("./utils");

let PACKAGE_BASE_URL = 'https://njs2.s3.ap-south-1.amazonaws.com';

/**
 * @function downloadPackage
 * @param {*} uri 
 * @param {*} filename 
 * @param {*} callback 
 * @description Download the package files from remote URI
 */
const downloadPackage = function (uri, filename, callback) {
  request.head(uri, function (err, res, body) {
    if (err) throw new Error('');
    console.log('content-type:', res.headers['content-type']);
    console.log('content-length:', res.headers['content-length']);

    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
};

/**
 * @function isPackageExists
 * @param {*} url 
 * @returns {Promise<boolean>}
 * @description Check if remote file exists
 */
const isPackageExists = async (url) => {
  const options = {
    'method': 'HEAD',
    'url': `${url}`
  };
  return await new Promise((resolve, reject) => {
    request(options, (err, res, body) => {
      resolve(res.statusCode == 200);
    });
  });
}

const replaceAt = function (str, index, replacement) {
  return str.substr(0, index) + replacement + str.substr(index + replacement.length);
}

const install = async (CLI_KEYS, CLI_ARGS) => {
  try {
    if (!fs.existsSync(`${path.resolve(process.cwd(), `package.json`)}`))
      throw new Error('Run from project root direcory: njs2 plugin <package-name> (Eg: @njs2/auth-email@latest)');

    const packageJson = require(`${path.resolve(process.cwd(), `package.json`)}`);
    if (packageJson['njs2-type'] != 'project') {
      throw new Error('Run from project root direcory: njs2 plugin <package-name> (Eg: njs2 plugin @njs2/auth-email@latest)');
    }

    let packageName = CLI_ARGS[0];
    if (!packageName || packageName.length == 0) {
      throw new Error('Invalid package name');
    }

    if (packageName.indexOf('@') == 0 && packageName.split('@').length == 3 && !validatePackageVersion(packageName.split('@')[2])) {
      throw new Error('Invalid package version');
    } else if (packageName.indexOf('@') == 0 && packageName.split('@').length == 2) {
      packageName = `${packageName}@latest`;
    }


    let PACKAGE_PATH = '';
    let remoteURL = '';
    if (packageName.split('@').length == 3 && packageName.split('@')[2] != 'latest') {
      PACKAGE_PATH = replaceAt(packageName, packageName.lastIndexOf('@'), '/');
      remoteURL = `${PACKAGE_BASE_URL}/${PACKAGE_PATH}.tar.gz`;
    } else {
      PACKAGE_PATH = replaceAt(packageName.split('@').length == 3 && packageName.split('@')[2] == 'latest' ? packageName : `${packageName}@latest`, packageName.lastIndexOf('@'), '/');
      remoteURL = `${PACKAGE_BASE_URL}/${PACKAGE_PATH}.tar.gz`;
    }

    console.log(remoteURL);
    const remoteFileExists = await isPackageExists(remoteURL);
    if (!remoteFileExists) throw new Error("Remote package dose not Exists!!")
    const urlComp = PACKAGE_PATH.split('/').slice(0, 2).join('/');
    const fileName = `${urlComp}.tar.gz`;
    if (!fs.existsSync('Njs2-modules'))
      fs.mkdirSync("Njs2-modules");

    if (!fs.existsSync('Njs2-modules/@njs2'))
      fs.mkdirSync("Njs2-modules/@njs2");

    let folderName = fileName.split('.')[0];
    if (!fs.existsSync(`Njs2-modules/${folderName}`))
      fs.mkdirSync(`Njs2-modules/${folderName}`);

    downloadPackage(remoteURL, `./Njs2-modules/${folderName}.tar.gz`, async () => {
      await tar.x({
        file: `./Njs2-modules/${fileName}`,
        cwd: `Njs2-modules/${folderName}`
      });
      console.log("exract completed");

      child_process.execSync(`npm i ./Njs2-modules/${folderName}`, { stdio: 'inherit' });
      child_process.execSync(`npm i`, { stdio: 'inherit' });
      child_process.execSync(`rm ./Njs2-modules/${fileName}`);
      const pluginPackageJson = require(`${path.resolve(process.cwd(), `Njs2-modules/${folderName}/package.json`)}`);

      if (pluginPackageJson['njs2-type'] == 'endpoint') {
        require('./init-package').initPackage(folderName);
      }

      if (pluginPackageJson['loadEnv']) {
        require('./init-env').initEnv(folderName);
      }
    });
  } catch (e) {
    console.error(e);
  }
}

module.exports.install = install;