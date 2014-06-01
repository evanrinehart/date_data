var DateData = {};

(function(){

  // flintmax+1 == flintmax, flintmax+2 != flintmax, spooky, avoid
  var flintmax = Math.pow(2, 53); // 9007199254740992

  // years past this point will fail for different technical reasons, disallow
  var max_year =  6165091887562;
  var min_year = -6165091897161;

  var month_origin; // arbitrary month
  var time_origin;  // arbitrary time

  var timezone_by_name = {};
  var timezones_by_region = {};
  var timezones = [];

  var UnixEpoch;    // new Day(1970,1,1).atTime(0,0,0)
  var JulianEpoch;  // new Day(-4713,11,24).atTime(12,0,0) i.e. 4714 BC

  var UTC; //TimeZone

  var Sunday;

  var Month;
  var Weekday;
  var Day;
  var LocalTime;
  var TimeZone;
  var ZonedTime;
  var UTCTime;
  var Year;


  function build_timezones(raw_tzdata){
    var i;
    var L=raw_tzdata.length;
    var row;
    for(i=0; i<L; i++){
      row = raw_tzdata[i];
      tz = new TimeZone(row[0], row[1], row[2], row[3], row[4], row[5]);
      timezones.push(tz);
      timezone_by_name[tz.name] = tz;
      if(timezones_by_region[tz.region] === undefined){
        timezones_by_region[tz.region] = [];
      }
      if(tz.region !== null){
        timezones_by_region[tz.region].push(tz);
      }
    }

    UTC = timezone_by_name['UTC'];
    if(UTC===undefined) throw new Error("UTC timezone not found");
  }


  function mod(a, b){
    return a - Math.floor(a / b)*b;
  }

  function div(a, b){
    return Math.floor(a/b);
  }

  function no_overflow(n){
    if(n > flintmax) throw new Error("arithmetic overflow");
  }

  function no_underflow(n){
    if(n < -flintmax) throw new Error("arithmetic underflow");
  }

  function plus(){ // add all args
    var c = 0;
    var i = 0;
    for(i=0; i<arguments.length; i++){
      c += arguments[i];
      no_overflow(c);
      no_underflow(c);
    }
    return c;
  }

  function minus(a, b){
    var c = a - b;
    no_overflow(c);
    no_underflow(c);
    return c;
  }

  function times(a, b){ // mult all args
    var c = 1;
    var i = 0;
    for(i=0; i<arguments.length; i++){
      c *= arguments[i];
      no_overflow(c);
      no_underflow(c);
    }
    return c;
  }

  function gregorian_to_mjd(y, m, d){
    var f = m <= 2 ? -1 : 0;
    var a1 = div(
      times(1461, plus(y,4800,f)),
      4
    );
    var a2 = div( 367 * (m-2-12*f), 12);
    var a3 = -div(
      3 * div(plus(y,4900,f), 100),
      4
    );
    return plus(a1,a2,a3,d,-32075,-2400001);
  }


  function mjd_to_gregorian(mjd){
    var l = mjd + 68569 + 2400001;
    var n = Math.floor(( 4 * l ) / 146097);
    l = l - Math.floor(( 146097 * n + 3 ) / 4);
    var i = Math.floor(( 4000 * ( l + 1 ) ) / 1461001);
    l = l - Math.floor(( 1461 * i ) / 4) + 31;
    var j = Math.floor(( 80 * l ) / 2447);
    var d = l - Math.floor(( 2447 * j ) / 80);
    l = Math.floor(j / 11);
    var m = j + 2 - ( 12 * l );
    var y = 100 * ( n - 49 ) + i + l;
    return [y,m,d];
  }

  f = mjd_to_gregorian;
  g = gregorian_to_mjd;

  function raw_month_add(y, m, count){
    var mplus = plus((m-1), count);
    var y2 = plus(y, div(mplus, 12));
    var m2 = mod(mplus,12) + 1;
    return [y2,m2];
  }

  function days_in_month(y, m){
    var ymNext = raw_month_add(y, m, 1);
    var mjd = gregorian_to_mjd(ymNext[0], ymNext[1], 1);
    var ymd = mjd_to_gregorian(mjd-1);
    return ymd[2];
  }

  function is_leap(year){
    return new Month(year, 2).dayCount == 29;
  }

  function raw_diff_days(y2, m2, d2, y1, m1, d1){
    var mj2 = gregorian_to_mjd(y2,m2,d2);
    var mj1 = gregorian_to_mjd(y1,m1,d1);
    return minus(mj2, mj1);
  }

  function pad(n){
    if(n < 10) return '0'+n;
    else return String(n);
  }

  function assert_type(arg, cl){
    if(!(arg instanceof cl)) throw new TypeError("bad arg type");
  }


  function decode_date(str){ 
    if(!str.match(/^-?\d+-\d+-\d+$/)) throw new Error("can't decode date "+str);
    var ymd = str.split('-');
    var mult = 1;
    if(ymd.length == 4){
      ymd = [ymd[1], ymd[2], ymd[3]];
      mult = -1;
    }
    var y = mult * parseInt(ymd[0],10);
    var m = parseInt(ymd[1],10);
    var d = parseInt(ymd[2],10);
    if(y < -flintmax || y > flintmax) throw new RangeError("year out of range");
    return [y,m,d];
  };

  function decode_time(str){ 
    if(!str.match(/^\d+:\d+:\d+(\.\d+)?$/))
      throw new Error("can't decode time "+str);
    var hms = str.split(':');
    var h = parseInt(hms[0],10);
    var m = parseInt(hms[1],10);
    var s = parseFloat(hms[2],10);
    if(s < 0 || !isFinite(s)) throw new RangeError("seconds out of range");
    return [h,m,s];
  };


  Month = function(year, month){
    if(year < min_year || year > max_year) throw new RangeError("year out of range");
    if(month < 1 || month > 12) throw new RangeError("month out of range");
    this.year = year;
    this.month = month;

    function diff_origin(m){
      var o = origin_month;
      return (m.year - o.year)*12 + (m.month - o.month);
    }

    this.diff = function(arg){
      assert_type(arg, Month);
      var d1 = diff_origin(m);
      var d2 = diff_origin(arg);
      return d1 - d2;
    };

    this.add = function(n){
      var ym = raw_month_add(this.year, this.month, n);
      return new Month(ym[0], ym[1]);
    };

    this.lt  = function(arg){ return this.compare(arg) < 0;  };
    this.gt  = function(arg){ return this.compare(arg) > 0;  };
    this.lte = function(arg){ return this.compare(arg) <= 0; };
    this.gte = function(arg){ return this.compare(arg) >= 0; };
    this.eq  = function(arg){ return this.compare(arg) == 0; };
    this.neq = function(arg){ return this.compare(arg) != 0; };

    this.compare = function(arg){
      if(this.year < arg.year) return -1;
      if(this.year > arg.year) return 1;
      if(this.month < arg.month) return -1;
      if(this.month > arg.month) return 1;
      return 0;
    };

    this.next = function(){ return this.add(1); };
    this.prev = function(){ return this.add(-1); };


    this.onDay = function(d){
      return new Day(this.year, this.month, d);
    }

    this.onDayClamp = function(d){
      if(d > this.dayCount) return new this.onDay(this.dayCount);
      else return new Day(this.year, this.month, d);
    }

    this.onDayRollover = function(d){
      if(d > this.dayCount) return new this.next().firstDay();
      else return new Day(this.year, this.month, d);
    }
    

    this.firstDay = function(){
      return new Day(this.year, this.month, 1);
    };

    this.lastDay = function(){
      return new Day(this.year, this.month, this.dayCount);
    };

    this.dayCount = days_in_month(this.year, this.month);

  };

  Month.decode = function(str){
    var ymd = decode_date(str);
    return new Month(ymd[0], ymd[1]);
  };

  Month.fromDay = function(d){
    return new Month(d.year, d.month);
  };

  /* end Month */

  Weekday = function(n){
    if(n < 0 || n > 6) throw new RangeError("argument out of range");

    var toString = function(n){
      switch(n){
        case 0: return "Sunday";
        case 1: return "Monday";
        case 2: return "Tuesday";
        case 3: return "Wednesday";
        case 4: return "Thursday";
        case 5: return "Friday";
        case 6: return "Saturday";
        default: throw new Error("BUG");
      }
    };

    this.encode = function(){ return n };
    this.name = toString(n);
    this.eq = function(arg){ return this.encode() == arg.encode(); }
    this.neq = function(arg){ return this.encode() != arg.encode(); }
    this.next = function(){ return new Weekday((n+1)%7); }
    this.prev = function(){ return new Weekday(mod(n-1,7)); }
  };

  Day = function(y, m, d){
    if(y < min_year || y > max_year) throw new RangeError("year out of range");
    if(m < 1 || m > 12) throw new RangeError("month out of range");
    var day_count = days_in_month(y,m);
    if(d < 1 || d > day_count) throw new RangeError("day out of range");
    
    this.year = y;
    this.month = m;
    this.day = d;

    this.toMonth = function(){ return new Month(y,m); };

    this.mjd = gregorian_to_mjd(y,m,d);

    this.dayOfWeek = new Weekday(mod(raw_diff_days(2014, 5, 25, y, m, d), 7));


    this.add = function(n){
      var ymd = mjd_to_gregorian(this.mjd + n);
      return new Day(ymd[0], ymd[1], ymd[2]);
    };

    this.addMonthsClamp = function(n){
      var m1 = Month.fromDay(this);
      var m2 = m1.add(n);
      return m2.onDayClamp(this.day);
    };

    this.addMonthsRollover = function(n){
      var m1 = Month.fromDay(this);
      var m2 = m1.add(n);
      return m2.onDayRollover(this.day);
    };

    this.addYearsClamp = function(n){
      var y = plus(this.year, n);
      var is_leap_day = this.month==2 && this.day==29;
      if(is_leap_day && !is_leap(y)) return new Day(y, 2, 28);
      else return new Day(y, this.month, this.day);
    };

    this.addYearsRollover = function(n){
      var y = plus(this.year, n);
      var is_leap_day = this.month==2 && this.day==29;
      if(is_leap_day && !is_leap(y)) return new Day(y, 3, 1);
      else return new Day(y, this.month, this.day);
    };

    this.diff = function(arg){
      assert_type(arg, Day);
      return raw_diff_days(
        this.year, this.month, this.day,
        arg.year, arg.month, arg.day
      );
    };

    this.compare = function(arg){
      var diff = this.diff(arg);
      if(diff < 0) return -1;
      if(diff > 0) return 1;
      return 0;
    };

    this.lt  = function(arg){ return this.diff(arg) < 0; };
    this.gt  = function(arg){ return this.diff(arg) > 0; };
    this.lte = function(arg){ return this.diff(arg) <= 0; };
    this.gte = function(arg){ return this.diff(arg) <= 0; };
    this.eq  = function(arg){ return this.diff(arg) == 0; };
    this.neq = function(arg){ return this.diff(arg) != 0; };

    this.encode = function(){
      return this.year + '-' + pad(this.month) + '-' + pad(this.day);
    };

    this.next = function(){ return this.add(1); }
    this.prev = function(){ return this.add(-1); }

    this.atMidnight = function(){
      return new LocalTime(this, 0, 0, 0);
    };

    this.atTime = function(h,m,s){
      return new LocalTime(this, h, m, s);
    };

    this.nextWeekday = function(weekday){
      var d = this;
      do{ d = d.next(); }while(d.dayOfWeek.neq(weekday));
      return d;
    };

    this.prevWeekday = function(weekday){
      var d = this;
      do{ d = d.prev(); }while(d.dayOfWeek.neq(weekday));
      return d;
    };

  };

  Day.decode = function(str){
    var ymd = decode_date(str);
    return new Day(ymd[0], ymd[1], ymd[2]);
  };

  Day.fromMJD = function(mjd){
    var ymd = mjd_to_gregorian(mjd);
    return new Day(ymd[0], ymd[1], ymd[2]);
  };

  /* end of Day */


  LocalTime = function(day, hour, minute, second){
    if(hour < 0 || hour > 23) throw new RangeError("argument out of range");
    if(minute < 0 || hour > 59) throw new RangeError("argument out of range");
    if(second < 0) throw new RangeError("argument out of range");

    this.hour = hour;
    this.minute = minute;
    this.second = second;

    this.day = day;

    this.seconds_past_midnight = this.hour*3600 + this.minute*60 + this.second;

    function normalize(time){
      if(time.seconds_past_midnight < 86400){
        return time;
      }
      else{
        return time.day.add(1).atMidnight();
      }
    }

    function diff_origin(time){
      var t = normalize(time);
      var o = time_origin;
      return t.day.diff(o.day)*86400 +
          (t.seconds_past_midnight - o.seconds_past_midnight);
    }

    this.compare = function(arg){
      if(this.day.lt(arg.day)) return -1;
      if(this.day.gt(arg.day)) return 1;
      if(this.hour < arg.hour) return -1;
      if(this.hour > arg.hour) return 1;
      if(this.minute < arg.minute) return -1;
      if(this.minute > arg.minute) return 1;
      if(this.second < arg.second) return -1;
      if(this.second > arg.second) return 1;
      return 0;
    };

    this.lt  = function(arg){ return this.compare(arg) < 0; };
    this.gt  = function(arg){ return this.compare(arg) > 0; };
    this.lte = function(arg){ return this.compare(arg) <= 0; };
    this.gte = function(arg){ return this.compare(arg) <= 0; };
    this.eq  = function(arg){ return this.compare(arg) == 0; };
    this.neq = function(arg){ return this.compare(arg) != 0; };

    /* difference and translation ignore leapseconds by treating any time
    during a "leap second period" as existing on midnight of the next day */

    this.addSeconds = function(dx){
      var t = normalize(this);
      var x0 = t.seconds_past_midnight;
      var xplus = x0 + dx;
      var x1 = mod(xplus, 86400);

      var h2 = Math.floor(x1 / 3600);
      var rem1 = mod(x1, 3600);
      var m2 = Math.floor(rem1 / 60);
      var s2 = mod(x1, 60);
      return new LocalTime(t.day.add(days), h2, m2, s2);
    };

    this.addMinutes = function(mins){ return this.addSeconds(mins*60); };
    this.addHours = function(hours){ return this.addSeconds(hours*3600); };
    this.addDays = function(days){ return this.onDay(this.day.add(days)); };

    this.addMonthsClamp = function(months){
      return this.onDay(this.day.addMonthsClamp(months));
    };

    this.addMonthsRollover = function(months){
      return this.onDay(this.day.addMonthsRollover(months));
    };

    this.addYearsClamp = function(years){
      return this.onDay(this.day.addYearsClamp(years));
    };

    this.addYearsRollover = function(years){
      return this.onDay(this.day.addYearsRollover(years));
    };

    this.onDay = function(day){
      return day.atTime(this.hour, this.minute, this.second);
    }

    this.diff = function(arg){
      assert_type(arg, LocalTime);
      var d1 = diff_origin(this);
      var d2 = diff_origin(arg);
      return d1 - d2;
    };

    this.encode = function(){
      return this.day.encode() + ' ' + [
        pad(this.hour),
        pad(this.minute),
        pad(this.second)
      ].join(':');
    };

    this.asUTC = function(){
      return new ZonedTime(this, UTC, 0);
    };

    this.asZone = function(zone){
      if(zone===undefined) throw new Error("bad timezone");
      var offset = zone.localToOffset(this); /* could throw an error */
      var utcTime = this.addMinutes(-offset);
      return new ZonedTime(utcTime, zone, offset);
    };

    this.mjd = this.day.mjd + this.seconds_past_midnight/86400;

  };

  LocalTime.decode = function(str){
    if(!str.match(/^-?\d+-\d+-\d+ \d+:\d+:\d+(\.\d+)?$/)){
      throw new Error("can't decode localtime "+str);
    }

    var datetime = str.split(' ');
    var ymd = decode_date(datetime[0]);
    var hms = decode_time(datetime[1]);
    return new Day(ymd[0],ymd[1],ymd[2]).atTime(hms[0], hms[1], hms[2]);
  };

  /* end LocalTime */


  TimeZone = function(name, region, tzname, nominalOffset, defaultOffset, transitions){
    this.name = name;
    this.region = region;
    this.tzName = tzname;
    this.nominalOffset = nominalOffset;

    this.utcToOffset = function(utc){
      var localTime = utc;
      /* magic (use transitions) */
      var offset = 0; //FIXME
      return offset;
    };

    this.localToOffset = function(local){
      return 0; //FIXME
      throw new Error([
        "invalid local time for this timezone: ",
        local.encode(),
        ' ',
        this.name
      ].join(''));
    };

    this.tryLocalToOffset = function(local){
      return 0;//FIXME
    };

    this.decode = function(str){
      var time = LocalTime.decode(str);
      return time.asZone(this);
    };

    this.decodeUnixTime = function(timestamp){
      var utcTime = UnixEpoch.addSeconds(timestamp);
      var offset = this.utcToOffset(utcTime);
      return new ZonedTime(utcTime, this, offset);
    };

  };

  TimeZone.byName = function(name){
    return timezone_by_name[name];
  };

  TimeZone.byRegion = function(region){
    return timezones_by_region(region);
  };

  /* end TimeZone */


  ZonedTime = function(utcTime, timeZone, offset){
    if(timeZone===undefined) throw new Error("bad timezone");
    this.localTime = utcTime.addMinutes(offset);
    this.timeZone = timeZone;

    this.inZone = function(zone){
      var new_offset = zone.utcToOffset(utcTime);
      return new ZonedTime(utcTime, zone, new_offset);
    };

    this.toUTC = function(){
      return new ZonedTime(utcTime, UTC, 0);
    };

    this.unixTime = function(){
      return utcTime.diff(UnixEpoch.localTime);
    };

    this.compare = function(arg){
      return utcTime.compare(arg.toUTC().localTime);
    };

    this.diff = function(arg){
      assert_type(arg, ZonedTime);
      return utcTime.diff(arg.toUTC().localTime);
    };

    this.encode = function(){
      return utcTime.encode();
    }

    this.addSeconds = function(n){
      return new ZonedTime(utcTime.addSeconds(n), timeZone, offset);
    }

  };

  /* end ZonedTime */


  function easterAlgorithm(year){
    /* ripped from hackage package time-1.4.2 */
    var century = div(year,100) + 1;
    var shiftedEpact = mod(
      plus(
        14,
        11*mod(year,19),
        -div(3*century, 4),
        div(5 + 8 * century, 25)
      ),
      30
    );
    if(shiftedEpact==0 || ( shiftedEpact==1 && mod(year,19) < 10)){
      var adjustedEpact = shiftedEpact+1;
    }
    else{
      var adjustedEpact = shiftedEpact;
    }
    var base = new Day(year, 4, 19);
    var paschalFullMoon = base.add(-adjustedEpact);
    return paschalFullMoon.nextWeekday(Sunday);
  }




  /* build timezones from data generate from tz data files */

/*
raw tz data consists of rows of
name, region, tzinfoname, nominal offset, default offset
and list of transition pairs (utc time of transition, new offset)

put data generate from tz database files here
*/
  var raw_tzdata = [
    ['UTC', null, 'UTC', 0, 0, []],
    ['US/Central', 'US', 'America/Chicago', -6, -6, []]
  ];

  build_timezones(raw_tzdata);  

  time_origin = { // arbitrary dummy bootstrap time for diffs
    day: new Day(1984, 12, 5),
    seconds_past_midnight: 0
  };
  month_origin = new Month(1890, 1); // arbitrary value

  /* 4714 BC is -4713 in proleptic year numbers */
  JulianEpoch = new Day(-4713, 11, 24).atTime(12, 0, 0).asUTC();
  UnixEpoch = new Day(1970, 1, 1).atMidnight().asUTC();

  /* corresponding to unix time 2^31, not minus 1 */
  Apocalypse38 = new Day(2038,1,19).atTime(3,14,8).asUTC();

  Sunday = new Weekday(0);

  /* exported */
  DateData = {
    Month: Month,
    Day: Day,
    Weekday: Weekday,
    LocalTime: LocalTime,
    TimeZone: TimeZone,
    ZonedTime: ZonedTime,

    easter: easterAlgorithm,
    isLeapYear: is_leap,

    Sunday: Sunday,
    Monday: new Weekday(1),
    Tuesday: new Weekday(2),
    Wednesday: new Weekday(3),
    Thursday: new Weekday(4),
    Friday: new Weekday(5),
    Saturday: new Weekday(6),

    JulianEpoch: JulianEpoch,
    UnixEpoch: UnixEpoch,
    Apocalypse38: Apocalypse38,

    getCurrentUTCTime: function(){
      return LocalTime.fromUnixTime(new Date().getTime()/1000);
    },

    getCurrentLocalTime: function(){
      var d = new Date();
      return new LocalTime(
        new Day(d.getFullYear(), d.getMonth()+1, d.getDate()),
        d.getHours(), d.getMinutes(), d.getSeconds()+d.getMilliseconds()/1000
      );
    },

    getCurrentLocalDate: function(){
      var d = new Date();
      return new Day(d.getFullYear(), d.getMonth()+1, d.getDate());
    }
  };


})();


Day = DateData.Day;
Month = DateData.Month;
LocalTime = DateData.LocalTime;
Weekday = DateData.Weekday;
TimeZone = DateData.TimeZone;
ZonedTime = DateData.ZonedTime;
UTCTime = DateData.UTCTime;
