var reactDomServer = require('react-dom/server');
var webpackconfig = require('./webpack.config');
var requirejs = require('requirejs');
var webpack = require('webpack');
var cheerio = require('cheerio');
var react = require('react');
var path = require('path');
var fs = require('fs');

/**
* @namespace
* @property {string} temp - path to a temp file for webpack to write to
* @property {RegEx[]} filters - patterns for esri modules
* @property {object} webpack
* @property {string} webpack.entry - Path to the component I wanna prerender
* @property {string} webpack.outputPath - path to local directory
* @property {string} webpack.outputFilename - Name where to render the temp file, may remove if I can compile to memory
* @property {object} rjs
* @property {function} rjs.map - map object, will contain modules matching the filters property and remaps to remap
* @property {string} rjs.remap - file to remap missing modules to, same as outputPath + outputFilename minus extension
* @property {object} react
* @property {string} react.mount - query to find DOM node to mount entry to
* @property {string} react.target - html file to read in inject component markup into
*/
var config = {
  temp: path.join(__dirname, './temp.js'),
  filters: [/esri\//, /dojo\//, /dijit\//],
  webpack: {
    entry: path.join(__dirname, 'src/js/components/App'),
    outputPath: path.resolve('./'),
    outputFilename: 'temp.js'
  },
  rjs: {
    map: function (map) { return { '*': map }; },
    remap: 'temp' // Same as outputPath + outputFilename minus extension
  },
  react: {
    mount: '#react-mount',
    target: path.join(__dirname, 'dist/index.html')
  }
};

/**
* @description
* 1. Configure and run webpack in production mode to create a minified build and output to temp.js
* 2. Create a map object that remaps all excluded modules from the bundle stats to itself, this allows us to require App
* even though some of the dependencies in our code are not present until runtime in the browser
* 3. Configure requirejs, I need this so I can remap modules
* 4. Require my React component and render it to a string
* 5. Use cheerio to load the target html file  and react markup to it (May be able to replace 6 and part of 7,
* If I was using pug or jade I could add the string to locals and compile jade/pug templates)
* 6. Write the file back to where you read it from and delete the temp file created in step 1
*/

//- 1
webpackconfig.entry = config.webpack.entry;
webpackconfig.output.path = config.webpack.outputPath;
webpackconfig.output.filename = config.webpack.outputFilename;
var compiler = webpack(webpackconfig);
compiler.run(function (err, stats) {
  if (err) { throw err; }
  var modules, ignores = [], map = {}, requireconfig = {};
  //- 2 Try to get a list of the modules excluded from the bundle
  //- I need to remap these so require does not throw ENOENT
  modules = stats.compilation.namedChunks.main.modules;
  ignores = modules.map(function (module) { return module.request; }).filter(function (module) {
    return config.filters.some(function (pattern) { return pattern.test(module); });
  });
  //- 3
  ignores.forEach(function (ignore) { map[ignore] = config.rjs.remap; });
  // Configure requirejs
  requireconfig.nodeRequire = require;
  requireconfig.map = config.rjs.map(map);
  requirejs(requireconfig);
  //- 4
  var Component = requirejs(config.webpack.outputFilename);
  var markup = reactDomServer.renderToString(react.createElement(Component.default));
  //- 5
  var file = fs.readFileSync(config.react.target, 'utf-8');
  var $ = cheerio.load(file);
  $(config.react.mount).append(markup);
  //- 6
  fs.writeFileSync(config.react.target, $.html());
  fs.unlinkSync(config.temp);
});
