//
//  Copyright 2011 (c) Finnbarr P. Murphy.  All rights reserved.
//

const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;
const Soup = imports.gi.Soup;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell');
const _ = Gettext.gettext;

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.weather';
const SETTINGS_KEY = 'zipcode';

const KPH2MPH = 0.62137;
const MM2INCH = 0.03937;

// configuration 
const MUNITS = 0;              // See the README  0 - Imperial units, >0 - SI (Metric) units
const WEATHERDATA_KEY = '2a647492a1015425110709';  // See the README  Enclose in single quotes

const WEATHERDATA_UPDATE_INTERVAL = 600;


function WeatherButton() {
    this._init.apply(this, arguments);
}

WeatherButton.prototype = {
    _weatherInfo: null,
    _currentWeather: null,
    _futureWeather: null,
    _metadata: null,

    __proto__: PanelMenu.Button.prototype,

    _init: function(metadata) {

        PanelMenu.Button.prototype._init.call(this, 0.5);

        // initialize settings
        this._settings = new Gio.Settings({ schema: SETTINGS_SCHEMA });
        this._changedId = this._settings.connect('changed::'+SETTINGS_KEY, Lang.bind(this, this._refreshWeather));

        this._weatherButton = new St.BoxLayout({ style_class: 'weather-status'});
        this._weatherIconBox = new St.BoxLayout({ style_class: 'weather-status-icon'});

        let weatherIcon = new St.Icon({
            icon_type: St.IconType.FULLCOLOR,
            icon_size: 22,
            icon_name: 'view-refresh-symbolic',
            style_class: 'weather-status-icon'
        });

        this._weatherIconBox.add_actor(weatherIcon);
        this._weatherButton.add_actor(this._weatherIconBox);

        this.actor.add_actor(this._weatherButton);

        Main.panel._centerBox.add(this.actor, { y_fill: true });
        Main.panel._menus.addMenu(this.menu);

        this._metadata = metadata;
        this._getWeatherInfo;

        let here = this;
        Mainloop.timeout_add(2000, function() {
            here._getWeatherInfo();
        });
    },

    // retrieve the weather data using SOAP
    _loadJSON: function(url, callback) {
        let here = this;
        let session = new Soup.SessionAsync();
        let message = Soup.Message.new('GET', url);
        session.queue_message(message, function(session, message) {
            let jObj = JSON.parse(message.response_body.data);
            callback.call(here, jObj);
        });
    },

    // retrieve a weather icon image
    _getIconImage: function(iconpath) {
         let icon_file = this._metadata.path + "/icons/" + 
                         iconpath[0].value.match(/\/wsymbols01_png_64\/(.*)/)[1];
         let file = Gio.file_new_for_path(icon_file);
         let icon_uri = file.get_uri();

         return St.TextureCache.get_default().load_uri_sync(1, icon_uri, 64, 64);
    },

    _getZipCode: function() {
        let zipcode = this._transientZip || this._settings.get_string(SETTINGS_KEY);
        return zipcode;
    },

    _getWeatherUrl: function() {
        let url = 'http://free.worldweatheronline.com/feed/weather.ashx?q=' 
                        + this._getZipCode() + '&format=json&num_of_days=5&key=' + WEATHERDATA_KEY;
        return url;
    },

    // get the weather information every WEATHERDATA_UPDATE_INTERVAL 
    // and update weather status on Panel
    _getWeatherInfo: function(successCb, errorCb) {
        this._loadJSON(this._getWeatherUrl(), function(data) {
            if (data == null)
                return;

            let weatherinfo = data['data'];
            
            this._weatherInfo = weatherinfo;
            if (weatherinfo["error"]) {
                let errors = weatherinfo["error"];
                this._clearAll();

                this._errorBox = new St.BoxLayout({ 
                    vertical: true,
                    style_class: 'error-box'
                });

                let errorInfo = new St.Label({
                    text: errors[0].msg,
                    style_class: 'error-status-text'
                });

                let loadIcon = new St.Icon({
                    icon_type: St.IconType.FULLCOLOR,
                    icon_size: 22,
                    icon_name: 'view-refresh-symbolic',
                    style_class: 'error-status-icon'
                });

                this._weatherButton.get_children().forEach(function (actor) { actor.destroy(); });
                this._weatherIconBox.add_actor(loadIcon);
                this._weatherButton.add_actor(this._weatherIconBox);

                this._errorBox.add_actor(errorInfo);
                this.menu.addActor(this._errorBox);

                errorCb && errorCb(error[0].message);
            } else {
                let curr = weatherinfo.current_condition;
                let desc = curr[0].weatherDesc;
                let comment = desc[0].value;
                let weatherIcon = this._getIconImage(curr[0].weatherIconUrl);
                let weatherInfo = new St.Label({text: (MUNITS > 0 ? curr[0].temp_C + 'C' : curr[0].temp_F + 'F'),
                                                style_class: 'weather-status-text' });

                this._weatherButton.get_children().forEach(function (actor) { actor.destroy(); });
                this._weatherIconBox.add_actor(weatherIcon);
                this._weatherButton.add_actor(this._weatherIconBox);
                this._weatherButton.add_actor(weatherInfo);
                this.actor.add_actor(this._weatherButton);

                if (this._weatherRetrieveId) {
                    this.actor.disconnect(this._weatherRetrieveId);
                }

                successCb && successCb();
                this._weatherRetrieveId = this.actor.connect('button-press-event', Lang.bind(this, this._clickHandler));
            }
        });

        Mainloop.timeout_add_seconds(WEATHERDATA_UPDATE_INTERVAL, 
                                     Lang.bind(this, this. _getWeatherInfo));
    },

    _clickHandler: function(container, event) {
        let right_click = event.get_button() == 3;

        if (right_click) {
            this._displayContextMenu();
        } else {
            this._displayUI();
        }
    },

    _clearAll: function() {
        // destroy any previous components 
        if (this._currentWeather != null) {
            this._currentWeather.get_children().forEach(function (actor) { actor.destroy(); });
        }

        if (this._futureWeather != null) {
            this._futureWeather.get_children().forEach(function (actor) { actor.destroy(); });
        }

        if (this._preferencesItem != null) {
            this._preferencesItem.destroy();
        }

        if (this._refreshItem != null) {
            this._refreshItem.destroy();
        }
        
        if (this._promptBox != null) {
            this._promptBox.destroy();
        }

        if (this._errorBox != null) {
            this._errorBox.destroy();
        }
    },

    _displayContextMenu: function() {
        this._clearAll();

        this._preferencesItem = new PopupMenu.PopupSubMenuMenuItem(_("Preferences"), { style_class: 'preferences-submenu' });
        this._refreshItem = new PopupMenu.PopupMenuItem(_('Refresh'));
        
        this._refreshItem.connect('activate', Lang.bind(this, this._refreshWeather));
        
        /* preferences */
        this._promptBox = new St.BoxLayout({ 
            style_class: 'weather-info-prompt-box',
            vertical: false
        });

        this._promptEntry = new St.Entry({ 
            style_class: 'weather-text-entry',
            can_focus: true
        });

        let btn = new St.Button({
            style_class: 'zip-btn',
            label: 'Set ZIP Code'
        });

        let self = this;

        btn.connect('clicked', Lang.bind(this, function() {
            let zip = this._promptEntry.get_text();

            let successCb = function() {
                self._settings.set_string(SETTINGS_KEY, zip);
                self._transientZip = null;
            };
            
            let errorCb = function(msg) {
                self._transientZip = null;
            };

            self._transientZip = zip;
            self._getWeatherInfo(successCb, errorCb);
        }));

        this._promptBox.add(this._promptEntry, { 
            expand: true,
            x_fill: false,
            y_fill: false,
            x_align: 1
        });

        this._promptBox.add(btn);

        this._promptMenuItem = new PopupMenu.PopupMenuItem(_(''));
        this._promptMenuItem.addActor(this._promptBox);

        this._preferencesItem.menu.addMenuItem(this._promptMenuItem);

        // this is a bit hackish I guess, but it works. Disconnect
        // all menu item events so entries can be used
        this._promptMenuItem.disconnect(this._promptMenuItem._activateId);
        this._promptMenuItem.disconnect(this._promptMenuItem._activeChangeId);
        this._promptMenuItem.disconnect(this._promptMenuItem._sensitiveChangeId);

        /* /preferences */

        this.menu.addMenuItem(this._refreshItem);
        this.menu.addMenuItem(this._preferencesItem);
    },

    _refreshWeather: function() {
        this._getWeatherInfo();
    },

    _displayUI: function(container, event) {
        if (this._weatherInfo == null) return;

        let weather = this._weatherInfo;
        let request = weather.request;
        let curr = weather.current_condition;
        let weathers = weather.weather;
        let desc = curr[0].weatherDesc;            
        let currLocation = request[0].query;    
        let comment = desc[0].value;
        let observeTime = this._adjustTime(weathers[0].date, curr[0].observation_time);  

        // current data
        let currTemperature = new St.Label({ text: (MUNITS > 0 ? curr[0].temp_F + 'F' : curr[0].temp_C + 'C') }); 
        let currHumidity = new St.Label({ text: (curr[0].humidity + '%') });
        let currPressure = new St.Label({ text: (MUNITS > 0 ? curr[0].pressure + ' mm' :  (curr[0].pressure * MM2INCH).toFixed(2) + '"') });
        let currWind = new St.Label({ text: (curr[0].winddir16Point + ' ' + 
                                     (MUNITS > 0 ? curr[0].windspeedKmph + ' kph' : curr[0].windspeedMiles + ' mph')) });

        let currVisibility = new St.Label({ text: (MUNITS > 0 ? curr[0].visibility + ' km' : parseInt(curr[0].visibility * KPH2MPH) + ' miles') });
        let currObserveTime = new St.Label({ text: observeTime }); 
        let currCloudCover = new St.Label({ text: (curr[0].cloudcover +'%') });
        let currPercipitation = new St.Label({ text: (MUNITS > 0 ? curr[0].precipMM + ' mm' :  (curr[0].precipMM * MM2INCH).toFixed(2) + '"') });

        // destroy any previous components 
        this._clearAll();

        let mainBox = new St.BoxLayout({ vertical: true,
                                         style_class: 'weather-box' });
        this._currentWeather = new St.BoxLayout({ style_class: 'weather-current-box'});
        this._futureWeather =  new St.BoxLayout({ style_class: 'weather-forecast-box'});
        mainBox.add_actor(this._currentWeather, { expand: false, x_fill: false });
        mainBox.add_actor(this._futureWeather, { expand: false, x_fill: false });
        this.menu.addActor(mainBox);

        let boxIcon = new St.BoxLayout({ style_class: 'weather-current-icon'});
        boxIcon.add_actor(this._getIconImage(curr[0].weatherIconUrl), { expand: false, x_fill: false, y_fill: false } );

        // set up left box for current conditions
        let boxLeft = new St.BoxLayout({ vertical: true, 
                                         style_class: 'weather-current-summarybox'});

        let summary = (MUNITS > 0 ? curr[0].temp_C + 'C' : curr[0].temp_F + 'F');
        let currSummary = new St.Label({ text: summary,
                                         style_class: 'weather-current-summary'});
        let currLocation = new St.Label({ text: currLocation,
                                          style_class: 'weather-location' });
        boxLeft.add_actor(currLocation);
        boxLeft.add_actor(currSummary);

        // set up middle box for current conditions
        let boxMiddle = new St.BoxLayout({ style_class: 'weather-current-databox-left'});
        let mbCaptions = new St.BoxLayout({ vertical: true, 
                                            style_class: 'weather-current-databox-captions'});
        let mbValues = new St.BoxLayout({ vertical: true, 
                                          style_class: 'weather-current-databox-values'});
        boxMiddle.add_actor(mbCaptions);
        boxMiddle.add_actor(mbValues);

        mbCaptions.add_actor(new St.Label({ text: _('Visibility:')}));
        mbValues.add_actor(currVisibility);
        mbCaptions.add_actor(new St.Label({ text: _('Humidity:')}));
        mbValues.add_actor(currHumidity);
        mbCaptions.add_actor(new St.Label({ text: _('Pressure:')}));
        mbValues.add_actor(currPressure);
        mbCaptions.add_actor(new St.Label({ text: _('Wind:')}));
        mbValues.add_actor(currWind);
        
        // set up right box for current conditions
        let boxRight = new St.BoxLayout({ style_class: 'weather-current-databox-right'});
        rbCaptions = new St.BoxLayout({ vertical: true, 
                                        style_class: 'weather-current-databox-captions'});
        rbValues = new St.BoxLayout({ vertical: true, 
                                      style_class: 'weather-current-databox-values'});
        boxRight.add_actor(rbCaptions);
        boxRight.add_actor(rbValues);

        rbCaptions.add_actor(new St.Label({ text: _('Temperature:')}));
        rbValues.add_actor(currTemperature);
        rbCaptions.add_actor(new St.Label({ text: _('Observe Time:')}));
        rbValues.add_actor(currObserveTime);
        rbCaptions.add_actor(new St.Label({ text: _('Cloud Cover:')}));
        rbValues.add_actor(currCloudCover);
        rbCaptions.add_actor(new St.Label({ text: _('Precipitation:')}));
        rbValues.add_actor(currPercipitation);

        this._currentWeather.add_actor(boxIcon);
        this._currentWeather.add_actor(boxLeft);
        this._currentWeather.add_actor(boxMiddle);
        this._currentWeather.add_actor(boxRight);
        
        // now set up the 5 day forecast area
        for (let i = 0; i < weathers.length; i++) {
            let weather = weathers[i];
            let foreWeather = {};

            // forecast data
            let desc = weather.weatherDesc;
            let t_low = (MUNITS > 0 ?  weather.tempMinC : weather.tempMinF);
            let t_high = (MUNITS > 0 ?  weather.tempMaxC : weather.tempMaxF);
            let foreDate = this._getDate(i, weather.date);

            foreWeather.Icon = this._getIconImage(weather.weatherIconUrl);
            foreWeather.Day = new St.Label({ style_class: 'weather-forecast-day',
                                             text: foreDate });
            foreWeather.Temperature = new St.Label({ style_class: 'weather-forecast-temperature',
                                                     text: (t_low + ' - ' + t_high + (MUNITS > 0 ? 'C' : 'F')) });

            let dataBox = new St.BoxLayout({vertical: true, style_class: 'weather-forecast-databox'});
            dataBox.add_actor(foreWeather.Day, { x_align: St.Align.START, expand: false, x_fill: false });
            dataBox.add_actor(foreWeather.Temperature, { x_align: St.Align.START, expand: false, x_fill: false });
            let iconBox = new St.BoxLayout({style_class: 'weather-forecast-icon'});
            iconBox.add_actor(foreWeather.Icon);

            this._futureWeather.add_actor(iconBox);
            this._futureWeather.add_actor(dataBox);
        }
    },

    // UTC time provided by weather data source. Convert to local time.
    _adjustTime: function(dateStr, timeStr) {

        let pattern = /(\d{4})-(\d{2})-(\d{2})/;
        let newDateStr = dateStr.replace(pattern, "$2/$3/$1") + ' ' + timeStr;

        let curDate = new Date();
        let tzOffset = curDate.getTimezoneOffset(); 

        let newMS = Date.parse(newDateStr) - ( tzOffset * 60000 ); 
        let newDate = new Date(newMS);
        
        return newDate.toTimeString().substring(0,5);    
    },

     // get day-of-week for a date
    _getDate: function(index, dateStr) { 
         switch (index) {
             case 0:
                 return _('Today');
             case 1:
                 return _('Tomorrow');
         }

         let dowString = [ _('Monday'),  _('Tuesday'),  _('Wednesday'),  _('Thursday'),
                           _('Friday'),  _('Saturday'),  _('Sunday') ];

         let tmpDate = new Date(dateStr);
         let tmpDOW  = tmpDate.getDay();

         return dowString[tmpDOW];
    }
};

/* new API changes */
let weatherApplet;
let metadata;

function enable() {
    if (!weatherApplet) {
        if (WEATHERDATA_KEY) {
            global.log('enable');
            weatherApplet = new WeatherButton(metadata);
        } else {
           global.log("ERROR: Weather extension. Missing WEATHERDATA_KEY or ZIPCODE.");
        }
    }
}

function disable() {
    weatherApplet.destroy();
    weatherApplet = null;
}
/* /new API changes */

function init(meta) {
    metadata = meta;
}
