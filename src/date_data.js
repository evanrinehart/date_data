var DateData = {};

(function(){

  function gregorian_to_jd(y, m, d){
    var f = m <= 2 ? -1 : 0;
    return (
      Math.floor(( 1461 * ( y + 4800 + f) ) / 4) +
      Math.floor( 367 * ( m - 2 - 12 * f) / 12) -
      Math.floor(3 * Math.floor(( y + 4900 + f) / 100) / 4) +
      d - 32075
    );
  }

  function jd_to_gregorian(jd){
    var l = jd + 68569;
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

  function is_leap(year){
    if(mod(year,4) != 0) return false;
    if(mod(year,100) != 0) return true;
    if(mod(year,400) != 0) return false;
    return true;
  }

  var nominal_days_in_month = {
    1: 31,
    2: 28,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 30,
    9: 30,
    10: 31,
    11: 30,
    12: 31,
  };

  function raw_diff_days(y2, m2, d2, y1, m1, d1){
    var j2 = gregorian_to_jd(y2,m2,d2);
    var j1 = gregorian_to_jd(y1,m1,d1);
    return j2 - j1;
  }

  function pad(n){
    if(n < 10) return '0'+n;
    else return String(n);
  }

  function mod(a, b){
    return a - Math.floor(a / b)*b;
  }

  var billion = 1000000000;
  var UnixEpoch;

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
    if(y < -billion || y > billion) throw new Error("year out of range");
    return [y,m,d];
  };

  function decode_time(str){ 
    if(!str.match(/^\d+:\d+:\d+(\.\d+)?$/))
      throw new Error("can't decode time "+str);
    var hms = str.split(':');
    var h = parseInt(ymd[0],10);
    var m = parseInt(ymd[1],10);
    var s = parseFloat(ymd[2],10);
    if(s < 0 || s > billion) throw new Error("seconds out of range");
    return [h,m,s];
  };


  var Month = function(year, month){
    if(year < -billion || year > billion) throw new Error("year out of range");
    if(month < 1 || month > 12) throw new Error("month out of range");
    this.year = year;
    this.month = month;

    function diff_origin(m){
      var o = origin_month;
      if(o.lt(m)) return (m.year - o.year)*12 + (m.month - o.month);
      else return -((o.year - m.year)*12 + (o.month - m.month));
    }

    this.diff = function(arg){
      var d1 = diff_origin(m);
      var d2 = diff_origin(arg);
      return d1 - d2;
    };

    this.add = function(n){
      var y = this.year + Math.floor(((this.month-1) + n) / 12);
      var m = mod(((this.month-1) + n),12) + 1;
      return new Month(y, m);
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

    if(month == 2 && is_leap(year)) this.day_count = 29;
    else this.day_count = nominal_days_in_month[month];

    this.firstDay = function(){
      return new Day(this.year, this.month, 1);
    };

    this.lastDay = function(){
      return new Day(this.year, this.month, this.dayCount);
    };

  };

  Month.decode = function(str){
    var ymd = decode_date(str);
    return new Month(ymd[0], ymd[1]);
  };

  Month.fromDay = function(d){
    return new Month(d.year, d.month);
  };

  /* end Month */

  var Weekday = function(n){
    if(n < 0 || n > 6) throw new Error("argument out of range");

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
    this.next = function(){ return new Weekday((n+1)%7); }
    this.prev = function(){ return new Weekday(mod(n-1,7)); }
  };

  var Day = function(y, m, d){
    if(y < -billion || y > billion) throw new Error("year out of range");
    if(m < 1 || m > 12) throw new Error("month out of range");
    var day_count = new Month(y, m).day_count;
    if(d < 1 || d > day_count) throw new Error("day out of range");
    
    this.year = y;
    this.month = m;
    this.day = d;

    this.toMonth = function(){ return new Month(y,m); };

    this.jd = gregorian_to_jd(y,m,d);
    this.mjd = this.jd - 2400001;

    this.dayOfWeek = new Weekday(mod(raw_diff_days(2014, 5, 25, y, m, d), 7));

    this.add = function(n){
      var ymd = jd_to_gregorian(this.jd + n);
      return new Day(ymd[0], ymd[1], ymd[2]);
    };

    this.addMonthsClamp = function(n){
      var m1 = Month.from_date(this);
      var m2 = m1.add(n);
      return m2.on_day_clamp(this.day);
    };

    this.addMonthsRollover = function(n){
      var m1 = Month.from_date(this);
      var m2 = m1.add(n);
      return m2.on_day_rollover(this.day);
    };

    this.addYears = function(n){
      return new Day(this.year+n, this.month, this.day);
    };

    this.diff = function(arg){
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

    this.atMidnight = function(){
      return new LocalTime(this, 0, 0, 0);
    };

    this.atTime = function(h,m,s){
      return new LocalTime(this, h, m, s);
    };
  };

  Day.decode = function(str){
    var ymd = decode_date(str);
    return new Day(ymd[0], ymd[1], ymd[2]);
  };

  /* end of Day */


  var LocalTime = function(day, hour, minute, second){
    if(hour < 0 || hour > 23) throw new Error("argument out of range");
    if(minute < 0 || hour > 59) throw new Error("argument out of range");
    if(second < 0) throw new Error("argument out of range");

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
        return time.day.add(1).at_midnight();
      }
    }

    function diff_origin(time){
      var t = normalize(time);
      var o = time_origin;
      if(o.lt(t)){
        return t.day.diff(o.day)*86400 +
          (t.seconds_past_midnight - o.seconds_past_midnight);
      }
      else{
        return -(o.day.diff(t.day)*86400 +
          (o.seconds_past_midnight - t.seconds_past_midnight));
      }
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
      var days = Math.floor(xplus / 86400);
      var h2 = Math.floor(x1 / 3600);
      var rem1 = mod(x1, 3600);
      var m2 = Math.floor(rem1 / 60);
      var s2 = mod(x1, 60);
      return new LocalTime(t.day.add(days), h2, m2, s2);
    };

    this.addMinutes = function(mins){ return this.add_seconds(mins*60); };
    this.addHours = function(hours){ return this.add_seconds(hours*3600); };
    this.addDays = function(days){ return this.onDay(this.day.add(days)); };
    this.addMonthsClamp = function(months){
      return this.onDay(this.day.addMonthsClamp(n));
    };
    this.addMonthsRollover = function(months){
      return this.onDay(this.day.addMonthsRollover(n));
    };
    this.addYears = function(years){
      return this.onDay(this.day.addYears(years));
    };

    this.onDay = function(day){
      return day.atTime(this.hour, this.minute, this.second);
    }

    this.unixTime = this.diff(UnixEpoch);

    this.diff = function(arg){
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

    this.mjd = this.day.mjd + this.seconds_past_midnight/86400;

  };

  LocalTime.fromUnixTime = function(timestamp){
    return UnixEpoch.add(timestamp);
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

  /* var is established above */
  UnixEpoch = new Day(1970, 1, 1).atMidnight();

  /* 4714 BC is -4713 in proleptic year numbers */
  var JulianEpoch = new Day(-4713, 11, 24).atTime(12, 0, 0);

  /* these values are arbitrary */
  var month_origin = new Month(1890, 1);
  var time_origin = new LocalTime(new Day(1984, 12, 5), 0, 0, 0);

  /* exported */
  DateData = {
    Month: Month,
    Day: Day,
    Weekday: Weekday,
    LocalTime: LocalTime,

    Sunday: new Weekday(0),
    Monday: new Weekday(1),
    Tuesday: new Weekday(2),
    Wednesday: new Weekday(3),
    Thursday: new Weekday(4),
    Friday: new Weekday(5),
    Saturday: new Weekday(6),
    JulianEpoch: JulianEpoch,
    UnixEpoch: UnixEpoch,

    getCurrentUTCTime: function(){
      return LocalTime.fromUnixTime(new Date().getTime()/1000);
    },
    getCurrentLocalTime: function(){
      var d = new Date();
      return new LocalTime(
        new Day(d.getFullYear(), d.getMonth(), d.getDate()),
        d.getHours(), d.getMinutes(), d.getSeconds()+d.getMilliseconds()/1000
      );
    },
    getCurrentLocalDate: function(){
      var d = new Date();
      return new Day(d.getFullYear(), d.getMonth(), d.getDate());
    }
  };

})();


//Day = DateData.Day;
//Month = DateData.Month;
//LocalTime = DateData.LocalTime;
//Weekday = DateData.Weekday;

