var request = require('request');

exports.errors = {
    NONE: 0,
    UNEXPECTED: 1,
    INVALID_PASSWORD: 2,
    TO_MANY_TOKENS: 3,
    INVALID_CREDENTIALS: 4,
    INVALID_TOKEN: 7202
};

exports.login = function(login, password, doneCallback) {
    console.log('login(' + login + ', *****)');
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
    console.log('getEmployeeInfo(' + token + ', ' + email + ')');
    request('https://people.zoho.com/people/api/forms/P_EmployeeView/records?authtoken=' + token, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var users = JSON.parse(body);
            var user = users.find(function(item) {
                return item['Email ID'].toUpperCase() == email.toUpperCase();
            });

            if (!user) {
                console.error('User not found!');
            }

            doneCallback(user);
        }
        else {
            processError(error, users, doneCallback);
        }
    });
};

exports.getTimeLogs = function(token, userId, fromDate, toDate, doneCallback) {
    console.log('getTimeLogs(' + token + ', ' + userId + ', ' + fromDate + ', ' + toDate + ')');
    var url = 'http://people.zoho.com/people/api/timetracker/gettimelogs?billingStatus=all&jobId=all&authtoken=' + token + '&user=' + userId + '&fromDate=' + fromDate + '&toDate=' + toDate;
    request(
        url,
        function(error, response, body) {
            var result = JSON.parse(body);
            console.log(body);
            if (!error && response.statusCode == 200 && result.response.status == 0) {
               doneCallback(result.response.result);
            } else {
                processError(error, result, doneCallback);
            }
        }
    );
}

exports.logTime = function(token, userId, date, doneCallback) {
    console.log('logTime(' + token + ', ' + userId + ', ' + date + ')');
    var getJobsUrl = 'http://people.zoho.com/people/api/timetracker/getjobs?authtoken=' + token;
    request(
        getJobsUrl,
        function(error, response, body) {
            var result = JSON.parse(body);
            if (!error && response.statusCode == 200 && result.response.status == 0) {
                var job = result.response.result.find(function(item){
                    return date >= new Date(item.fromDate) && date <= new Date(item.toDate);
                });

                if (job) {
                    logTimeForJob(token, userId, date, job.jobId, '08:00', doneCallback);
                } else {
                    doneCallback("Job for specified date not found");
                }
            } else {
                processError(error, result, doneCallback);
            }
        }
    );
}

exports.checkIfHoliday = function(token, userId, date, doneCallback) {
    console.log('checkIfHoliday(' + token + ', ' + userId + ', ' + date + ')');
    var getLeavesUrl = 'https://people.zoho.com/people/api/forms/leave/getRecords?authtoken=' + token
     + '&searchColumn=EMPLOYEEID&searchValue=' + userId;
     request(
        getLeavesUrl,
        function(error, response, body) {
            var result = JSON.parse(body);
            if (!error && response.statusCode == 200 && result.response.status == 0) {
                var isOnVacationForSelectDate = result.response.result.some(function(x){
                    var item = x[Object.keys(x)[0]][0];
                    var from = new Date(item.From);
                    var to = new Date(item.To);
                    return date.getDate() >= from.getDate() && date.getMonth() >= from.getMonth() && date.getFullYear() >= from.getFullYear()
                        && date.getDate() <= to.getDate() && date.getMonth() <= to.getMonth() && date.getFullYear() <= to.getFullYear() 
                        && item.ApprovalStatus.toUpperCase() == 'APPROVED'
                        && (item.Leavetype.toUpperCase() == 'HOLIDAY' || item.Leavetype.toUpperCase() == 'SICK');
                });

                doneCallback(isOnVacationForSelectDate);
            } else {
                processError(error, result, doneCallback);
            }
        }
    );
}

var processError = function(error, result, doneCallback){
    console.error(error);
    console.error(result.response.message);
    console.error(result.response.status);
    console.error(result.response.errors.code);
    console.error(result.response.errors.message);
    
    if (result.response.errors.code == exports.errors.INVALID_TOKEN) {
        doneCallback(exports.errors.INVALID_TOKEN);
    } else {
        doneCallback(exports.errors.UNEXPECTED);
    }
}

var logTimeForJob = function(token, userId, date, jobId, hours, doneCallback) {
    console.log('logTimeForJob(' + token + ', ' + userId + ', ' + date + ', '+ jobId + ', ' + hours + ')');
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
            console.log(body);
            var result = JSON.parse(body);
            if (!error && response.statusCode == 200 && result.response.status == 0) {
                doneCallback(result.response.message);
            } else {
                processError(error, result, doneCallback);
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