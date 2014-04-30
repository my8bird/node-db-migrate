var fs = require('fs');
var path = require('path');
var inflection = require('./inflection');
var lpad = require('./util').lpad;
var config = require('./config');
var log = require('./log');

var filesRegEx = /\.js$/;
var coffeeSupported = false;
var coffeeModule = null;
try {
  coffeeModule = require('coffee-script');
  if (coffeeModule && coffeeModule.register) coffeeModule.register();
  coffeeSupported = true;
  filesRegEx = /\.(js|coffee)$/;
} catch (e) {}

function formatPath(dir, name) {
  return path.join(dir, name);
}

function formatName(title, num) {
  return num + '-' + formatTitle(title);
}

function formatTitle(title) {
  return inflection.dasherize(title);
}

function writeMigrationRecord(db, migration, callback) {
  db._runSql('INSERT INTO migrations (name, version) VALUES (?, ?)',
             [migration.name, migration.num],
             callback);
}

var migrationTemplate = [
  "var dbm = require('db-migrate');",
  "var type = dbm.dataType;",
  "",
  "exports.up = function(db, callback) {",
  "",
  "};",
  "",
  "exports.down = function(db, callback) {",
  "",
  "};",
  ""
].join("\n");

var Migration = function() {
  if (arguments.length == 3) {
    this.title = arguments[0];
    this.num  = arguments[2];
    this.name = formatName(this.title, this.num);
    this.path = formatPath(arguments[1], this.name);
  } else if (arguments.length == 1) {
    this.path  = arguments[0];
    this.name  = Migration.parseName(this.path);

    var match  = this.name.match(/(\d+)-([^\.]+)/);
    this.num   = match[1];
    this.title = inflection.humanize(match[2], true);
  }
};

Migration.prototype._up = function() {
  return require(this.path).up.apply(this, arguments);
};

Migration.prototype._down = function() {
  return require(this.path).down.apply(this, arguments);
};

Migration.prototype.write = function(callback) {
  fs.writeFile(this.path, migrationTemplate, callback);
};

Migration.prototype.up = function(db, callback) {
  this._up(db, callback);
};

Migration.prototype.down = function(db, callback) {
  this._down(db, callback);
};

Migration.parseName = function(path) {
  var match = path.match(/(\d+-[^.]+)(?:\.*?)?/);
  return match[1];
};

Migration.loadFromFilesystem = function(dir, callback) {
  log.verbose('loading migrations from dir', dir);
  fs.readdir(dir, function(err, files) {
    if (err) { callback(err); return; }
    var coffeeWarn = true;
    files = files.filter(function(file) {
      if (coffeeWarn && !coffeeSupported && /\.coffee$/.test(file)) {
        log.warn('CoffeeScript not installed');
        coffeeWarn = false;
      }
      return filesRegEx.test(file);
    });
    var migrations = files.sort().map(function(file) {
      return new Migration(path.join(dir, file));
    });
    callback(null, migrations);
  });
};

Migration.loadFromDatabase = function(dir, driver, callback) {
  log.verbose('loading migrations from database');
  driver.all('SELECT * FROM migrations ORDER BY name DESC', function(err, dbResults) {
    if (err) { callback(err); return; }
    var migrations = dbResults.map(function(result) {
      return new Migration(path.join(dir, result.name));
    });
    callback(null, migrations);
  });
};

module.exports = Migration;
