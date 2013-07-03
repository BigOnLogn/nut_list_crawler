
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , querystring = require('querystring')
  , fs = require('fs');

var fbgraph = require('fbgraphapi'),
    async = require('async'),

    output_path = process.env.npm_package_config_output_path;

var app = express();

// all environments
app.set('port', process.env.npm_package_config_port || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser('your secret here'));
app.use(express.session());
app.use(fbgraph.auth({
  appId: process.env.npm_package_config_app_id,
  appSecret: process.env.npm_package_config_app_secret,
  redirectUri: process.env.npm_package_config_redirect_uri
}));
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/login', function(req, res) {
  console.log('start login');
  fbgraph.redirectLoginForm(req, res);
});

app.get('/', function(req, res) {
  if (!_running) {
    _running = true;

    if (!req.hasOwnProperty('facebook')) {
      console.log('not logged in');
      return res.redirect('/login');
    }

    req.facebook.graph('/287924391262333/feed?limit=100', function(err, result) {
      console.log('result:', result);
      if (result['data'] && result['data'].length && result['paging'] && result['paging']['next']) {
        // save initial results & kick off async.until
        fs.writeFileSync(output_path, '[');
        _q.push(result['data']);
        var qs = querystring.parse(result['paging']['next']);

        get_next(req.facebook, qs, function(err) {
          console.log("I'm done!");
          console.log('call count:', _count);
          console.log('save count:', _save_count);
          console.log("err:", err);
          _running = false;
        });
      }
    });

  }

  res.send("Check console output");
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

var _running = false,
    _test = false
    _q = async.queue(async_file_save),
    _count = 1,
    _save_count = 0,
    _sep = '';

_q.drain = function() {
  if (!_running) {
    fs.appendFile(output_path, ']', function() { console.log('closed file'); });
  }
};

function get_next(fb, qs, callback) {
  var q = {
    limit: 100,
    until: qs['until'],
    __paging_token: qs['__paging_token']
  };

  _count++;
  fb.graph('/287924391262333/feed?' + querystring.stringify(q), function(err, res) {
    if (err) { callback(err); }
    else {
      if (res['data'] && res['data'].length && res['paging'] && res['paging']['next']) {
        _q.push(res['data']);
        var i_qs = querystring.parse(res['paging']['next']);

        get_next(fb, i_qs, callback);
      } else {
        callback();
      }
    }
  })
}

function async_file_save(data, callback) {
  console.log('saving data:', data.id);

  fs.appendFile(output_path, _sep + JSON.stringify(process_raw_nut(data)), callback);
  _sep = ','
  _save_count++;
}

function process_raw_nut(nut) {
  ['created_time', 'updated_time'].forEach(function(time) {
    if (nut[time]) {
      nut[time] = new Date(nut[time]).getTime();
    }
  });
  if (nut['link'] && nut['link'].indexOf('youtu') > 0) {
    nut['embed_link'] = create_embed_link(nut['link']);
  }
  return nut;
}

function create_embed_link(link) {
  var qs
  if (link.indexOf('youtu.be') >= 0) {
    qs = link.substring(link.indexOf('.be/') + 4);
    return '<iframe width="420" height="345" src="http://www.youtube.com/embed/' + qs + '" frameborder="0" allowfullscreen></iframe>';
  }
  qs = querystring.parse(link.substring(link.indexOf('?') + 1));
  return '<iframe width="420" height="345" src="http://www.youtube.com/embed/' + qs['v'] + '" frameborder="0" allowfullscreen></iframe>';
}