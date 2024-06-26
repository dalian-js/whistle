var Transform = require('pipestream').Transform;
var util = require('util');

var LENGTH = 5120;
var slice = [].slice;
var SUB_MATCH_RE = /(^|\\{0,2})?(\$\$?(b)?[&\d])/g;
var ALL_RE = /^\/\.[*+]\/g?i?g?$/;
var MAX_SUB_MATCH_LEN = 512;

function ReplacePatternTransform(pattern, value, isSSE) {
  Transform.call(this);
  this._pattern = pattern;
  this._replaceAll = ALL_RE.test(pattern);
  this._value = value == null ? '' : value + '';
  this._isSSE = isSSE;
  this._rest = '';
}

util.inherits(ReplacePatternTransform, Transform);

var proto = ReplacePatternTransform.prototype;
proto._transform = function (chunk, _, callback) {
  var value = this._value;
  if (this._replaceAll) {
    this._value = '';
    chunk = value;
  } else if (chunk != null) {
    chunk = this._rest + chunk;
    var index = 0;
    var len = chunk.length - MAX_SUB_MATCH_LEN;
    var result = chunk.replace(this._pattern, function () {
      var matcher = arguments[0];
      var matcherLen = matcher.length;
      var i = arguments[arguments.length - 2] + matcherLen;
      var subLen = i - len;
      if (subLen >= 0 && matcherLen <= LENGTH - subLen) {
        return matcher;
      }
      index = i;
      return replacePattern(value, arguments);
    });
    index = Math.max(index, chunk.length - LENGTH);
    if (this._isSSE) {
      var endIndex = chunk.lastIndexOf('\n\n');
      if (endIndex !== -1) {
        index = Math.max(endIndex + 2, index);
      }
    }
    this._rest = chunk.substring(index);
    chunk = result.substring(0, result.length - this._rest.length);
  } else if (this._rest) {
    chunk = this._rest.replace(this._pattern, function () {
      return replacePattern(value, arguments);
    });
  }

  callback(null, chunk);
};

function getSubMatchers(args) {
  args = slice.call(args);
  return args.slice(0, -2);
}
function replacePattern(replacement, args, vals) {
  var arr = args && args.length ? getSubMatchers(args) : args;
  return replacement
    ? replacement.replace(SUB_MATCH_RE, function (_, $1, $2, $3) {
      var list = $3 ? vals : arr;
      if (!list) {
        return $1 + $2;
      }
      if ($1 === '\\') {
        return $2;
      }
      if ($1 === '\\\\') {
        $1 = '\\';
      }
      var encode = $2[1] === '$';
      $2 = $2.substring((encode ? 2 : 1) + ($3 ? 1 : 0));
      if ($2 === '&') {
        $2 = 0;
      }
      $2 = list[$2] || '';
      if (encode && $2) {
        try {
          $2 = encodeURIComponent($2);
        } catch (e) {}
      }
      return ($1 || '') + $2;
    })
    : '';
}
ReplacePatternTransform.replacePattern = replacePattern;
module.exports = ReplacePatternTransform;
