var request = require('request');

exports.errors = {
    NONE: 0,
    UNEXPECTED: 1,
    INVALID_PASSWORD: 2,
    TO_MANY_TOKENS: 3,
    INVALID_CREDENTIALS: 4
};

exports.login = function(login, password, doneCallback) {
    if (!doneCallback) {
        console.error("doneCallback is not defined")
        return;
    }

    if (!login) {
        console.error("login is not defined")
        return;
    }

    if (!password) {
        console.error("password is not defined")
        return;
    }
    
    var encodedLogin = encodeURIComponent(login);
    var encodedPassword = encodeURIComponent(password);
           
    request(
        'https://accounts.zoho.com/apiauthtoken/nb/create?SCOPE=Zohopeople/peopleapi&EMAIL_ID=' + encodedLogin + '&PASSWORD=' + encodedPassword, 
        function (error, response, body) {
            console.log(body);
            if (!error && response.statusCode == 200) {
                if (body.indexOf('RESULT=TRUE') != -1) {
                    doneCallback(prepareResult(exports.errors.NONE, parseAuthToken(body)));                                
                } else if (body.indexOf('INVALID_PASSWORD') != -1) {
                    doneCallback(prepareResult(exports.errors.INVALID_PASSWORD));
                } else if (body.indexOf('EXCEEDED_MAXIMUM_ALLOWED_AUTHTOKENS') != -1) {
                    doneCallback(prepareResult(exports.errors.TO_MANY_TOKENS));
                } else if (body.indexOf('INVALID_CREDENTIALS' != -1)){
                    doneCallback(prepareResult(exports.errors.INVALID_CREDENTIALS));
                } else {
                    doneCallback(prepareResult(exports.errors.UNEXPECTED));    
                }
            } else {
                doneCallback(prepareResult(exports.errors.UNEXPECTED));
            }
        }
    );
};

exports.getEmployeeInfo = function(token, email, doneCallback) {
    request('https://people.zoho.com/people/api/forms/P_EmployeeView/records?authtoken=' + token, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var users = JSON.parse(body);
            var user = users.find(function(item) {
                return item['Email ID'] == email;
            });
            doneCallback(user);
        }
        else {
            console.error(error);
        }
    });
};

exports.getTimeLogs = function(token, userId, fromDate, toDate, doneCallback) {
    var url = 'http://people.zoho.com/people/api/timetracker/gettimelogs?billingStatus=all&jobId=all&authtoken=' + token + '&user=' + userId + '&fromDate=' + fromDate + '&toDate=' + toDate;
    request(
        url,
        function(error, response, body) {
            if (!error && response.statusCode == 200) {
               var result = JSON.parse(body);
               if (result.response.status != 0) {
                   console.error(result.response.message);
               }
               else {
                   doneCallback(result.response.result);
               }
            }
            else {
                console.error(error);
            }
        }
    );
}

exports.logTime = function(token, userId, date, doneCallback) {
    var getJobsUrl = 'http://people.zoho.com/people/api/timetracker/getjobs?authtoken=' + token;
    request(
        getJobsUrl,
        function(error, response, body) {
            if (!error && response.statusCode == 200) {
               var result = JSON.parse(body);
               if (result.response.status != 0) {
                   console.error(result.response.message);
               }
               else {
                   var job = result.response.result.find(function(item){
                       return date >= new Date(item.fromDate) && date <= new Date(item.toDate);
                   });
                   if (job) {
                       logTimeForJob(token, userId, date, job.jobId, '08:00', doneCallback);
                   } else {
                       doneCallback("Job for specified date not found");
                   }
               }
            }
            else {
                console.error(error);
            }
        }
    );
}

var logTimeForJob = function(token, userId, date, jobId, hours, doneCallback) {
    var logTimeUrl = 'https://people.zoho.com/people/api/timetracker/addtimelog' +
        '?authtoken=' + token + 
        '&user=' + userId +
        '&jobId=' + jobId +
        '&workDate=' + formatDate(date) + 
        '&billingStatus=non-billable' +
        '&hours=' + hours;
    request.post(
        logTimeUrl,
        function(error, response, body) {
            if (!error && response.statusCode == 200) {
               var result = JSON.parse(body);
               if (result.response.status != 0) {
                   console.error(result.response.message);
               }
               else {
                   doneCallback(result.response.message);
               }
            }
            else {
                console.error(error);
            }
        }
    );
};

var prepareResult = function(error, token) {
    return { isSuccess: error === exports.errors.NONE, token: token, error: error };
}

var parseAuthToken = function(body) {
    var authTokenMark = 'AUTHTOKEN=';
    var authTokenLength = 32;
    var startIndex = body.indexOf(authTokenMark);
    if (startIndex == -1) {
        return "";
    }

    startIndex = startIndex + authTokenMark.length
    return body.substring(startIndex, startIndex + authTokenLength);
}

formatDate = function(date){
    var day = date.getDate();
    var month = date.getMonth() + 1;
    var year = date.getFullYear();
    
    return year + '-' + month + '-' + day;
}