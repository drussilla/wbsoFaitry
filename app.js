if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var zoho = require('./zoho');

var Botkit = require('botkit');
var schedule = require('node-schedule');

var controller = Botkit.slackbot({
    debug: false,
    json_file_store: 'database.json'
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

var j = schedule.scheduleJob('10 17 * * 1-5', function(){
    console.log('Time to log working hours...');
    controller.storage.users.all(function(err, all_user_data) {
        all_user_data.forEach(function(item) {
            console.log(item.id);
            askForTimeLog({user: item.id}, "Do you want me to log your time for today?");
        });
    });
});

controller.hears(['hello', 'hi', 'привет'], 'direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.token) {
            bot.reply(message, 'Hi! I am here to make your life easier! Type "help" to see what I can do for you');
        } else {
            askForLoginAndPassword(message);
        }
    });
});

controller.hears(['login', 'auth', 'authorize'], 'direct_message,direct_mention,mention', function(bot, message){
    askForLoginAndPassword(message);
});

controller.hears(['log'], 'direct_message,direct_mention,mention', function(bot, message){
    askForTimeLog(message, 'You 8 hours for today?');
});

controller.hears(['help','who are you'],  'direct_message,direct_mention,mention', function(bot, message){
    bot.reply(message, 'I am here to help you with WBSO time tracking. I can log time for you. You should say "Hi" to me, and then I will daily remind you about WBSO');
    bot.reply(message, 'If you have any questions, concact <@U0BGA8B5F|Ivan>. He is my master!');
    bot.reply(message, '*login* - Login in to ZOHO and save auth information for further use.');
    bot.reply(message, '*log* - Log 8 hours for today date.');
    bot.reply(message, '*status* - Show your current status.');
    bot.reply(message, '*help* - Show this message.');
});

controller.hears(['status(.*)'], 'direct_message', function(bot, message){
    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.token) {
            var dateRange = parseDates(message.match[1]);
            bot.reply(message, 'Status from ' + formatDate(dateRange.from) + ' to ' + formatDate(dateRange.to) + '\nName: ' + user.firstName + ' ' + user.lastName + '\nID: ' + user.zohoid + '\nToken: ' + user.token + '\nEmail: ' + user.email);
           
            zoho.getTimeLogs(user.token, user.zohoid, formatDate(dateRange.from), formatDate(dateRange.to), function(loggedTimes) {
                if (loggedTimes.length == 0){
                     colorMessage(bot, message, 'Time is not logged yet', 'You should always log your time!', 'warning');
                     askForTimeLog(message, 'Do you want to log time for today?');
                }
                else {
                    loggedTimes.sort(function(a, b){
                        return Date.parse(a.workDate) - Date.parse(b.workDate);
                    }).forEach(function(item) {
                        colorMessage(bot, message, item.workDate, item.hours + ' hours on ' + item.jobName, 'good');
                    });   
                }             
            });
        } else {
            bot.reply(message, 'You should *login* first.');
        }
    });
});

askForLoginAndPassword = function(message) {
    bot.startPrivateConversation(message, function(response, conv) {
        conv.ask("What is your ZOHO login?", function(response, conv) {
            var login = extractEmail(response.text);
            conv.ask("and password?", function(response, conv){
                var password = response.text;
                conv.say('OK! Connecting to ZOHO People... Please wait a bit...');
                zoho.login(login, password, function(result) {
                    if (result.isSuccess) {
                        zoho.getEmployeeInfo(result.token, login, function(userInfo) {
                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }

                                user.zohoid = userInfo['EmployeeID'];
                                user.email = userInfo['Email ID'];
                                user.firstName = userInfo['First Name'];
                                user.lastName = userInfo['Last Name'];
                                user.token = result.token;
                                controller.storage.users.save(user, function(err, id) {
                                    conv.say('Login information updated, ' + user.firstName);
                                    conv.next();
                                });
                            });
                        });                        
                    } else {
                        if (result.error == zoho.errors.INVALID_PASSWORD) {
                             conv.say('Wrong passwrod...');                        
                        } else if (result.error == zoho.errors.TO_MANY_TOKENS) {
                             conv.say('You have used all your auth tokens, go to https://accounts.zoho.com/u/h#sessions/userauthtoken and delete unused')
                        } else if (result.error == zoho.errors.INVALID_CREDENTIALS) {
                             conv.say('Wrong credentials. Please use your email as a login.')
                        } else {
                             conv.say('Unexpected error');
                        }
                        conv.next();
                    }
                });
            });

            conv.next();
        });

        conv.on('end', function(conv) {
            if (conv.status != 'completed') {
                conv.say('Type *login* to try one more time');
            }
        });
    });
};

askForTimeLog = function(message, question){
    bot.startPrivateConversation(message, function(response, convo) {
        if (!convo) {
            return;
        }
        convo.ask(question, [
        {
            pattern: bot.utterances.yes,
            callback: function(response,convo) {
                convo.say('Great! I will do that');
                logTime(message, new Date(), function() {
                    convo.next();
                });
            }
        },
        {
            pattern: bot.utterances.no,
            callback: function(response,convo) {
                convo.say('Okay....');
                convo.next();
            }
        },
        {
            default: true,
            callback: function(response,convo) {
                // just repeat the question
                convo.repeat();
                convo.next();
            }
        }
        ]);
    });
};

logTime = function(message, date, doneCallback){
    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.token && user.zohoid) {
            zoho.logTime(user.token, user.zohoid, date, function(result) {          
                bot.reply(message, result);
                doneCallback();   
            });
        } else {
            bot.reply(message, 'You should *login* first.');
            doneCallback();
        }
    });
};

colorMessage = function(bot, message, title, text, color)
{
    bot.reply(message, {
        'attachments': [
        {
            'fallback': text,
            'title': title,
            'text': text,
            'color': color
        }],
        });
}

parseDates = function(dateString) {
    var now = new Date();
    var result = { from : new Date(), to: now };
    if (dateString.indexOf('week') != -1) {
        result.from.setDate(now.getDate() - 7); 
    } else if (dateString.indexOf('month') != -1) {
        result.from.setDate(now.getDate() - 31); 
    }
    return result;
}

formatDate = function(date){
    var day = date.getDate();
    var month = date.getMonth() + 1;
    var year = date.getFullYear();
    
    return year + '-' + month + '-' + day;
}

extractEmail = function(email) {
    var delimiterIndex = email.indexOf('|');
    if (delimiterIndex == -1) {
        return email;
    } 

    return email.substring(delimiterIndex + 1, email.length - 1);
}