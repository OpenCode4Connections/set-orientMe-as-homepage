/*
 * © Copyright IBM Corp. 2017, 2018
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at:
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

var IdleTimer = (function () {
	/**
	 * IdleTimer object is created on each page that needs to participate in inactivity monitoring. 
	 * If inactivity across all monitored pages is detected, user page will display a warning message
	 * that indicates a Logout is imminent. Once the warning period expires (i.e. 1 minute by default), the user 
	 * will be logged out.
	 * @constructor
	 * @param idleTimeout The amount of inactive time allowed until a logout warning is given (in minutes). A value of -1 indicates short development timeout values should be use.
	 * @param cookieDomain The domain of the cookie used to track activity across all pages (e.g. .collabserv.com)
	 * @param logoutSSO The url used to force logout.
	 */
	var cls = function(idleTimeout, cookieDomain, logoutSSO, translationText) {
		var DEBUG = false ;
	

		var IDLE_TIMEOUT = idleTimeout * 5 * 1000; 
		
		// frequency to check idle cookie (to see if any page has activity)
		var CHECK_TIME_PERIOD = 1000;
		
		// ckeditor check time (how often to check to see if user has started a ckeditor)
		var CHECK_CKEDITOR_FREQUENCY = 3000;
		
		// iframe listener check time (how often to see if user has done something that created an iframe) 
		var CHECK_IFRAMELISTENER_FREQUENCY = 3000;
		
		// number of seconds that the logout warning is shown
		var COUNT_DOWN_INITIAL = 60;
		
		// check for development mode and override a couple of settings ... 
		if (idleTimeout === -1) {
			// development mode timeout values
			IDLE_TIMEOUT = 10000; // only allow 10 seconds of inactivity
			COUNT_DOWN_INITIAL = 10; // and the final warning period is only 10 seconds
		}		

		if (DEBUG) console.debug("*IdleTimer.IDLE_TIMEOUT = " +IDLE_TIMEOUT);
		if (DEBUG) console.debug("*IdleTimer.CHECK_TIME_PERIOD = " +CHECK_TIME_PERIOD);
		if (DEBUG) console.debug("*IdleTimer.CHECK_CKEDITOR_FREQUENCY = " +CHECK_CKEDITOR_FREQUENCY);
		if (DEBUG) console.debug("*IdleTimer.COUNT_DOWN_INITIAL = " +COUNT_DOWN_INITIAL);

		// cookie variables (path and name)
		var COOKIE_NAME = 'IdleCheck';
		var COOKIE_DOMAIN = cookieDomain;
		
		// flag that's true when warning is being displayed, false otherwise
		var warningIsDisplayed = false;

		// time of most recent user action on this page (also stored in the cookie)
		var lastActionTime = new Date().getTime();

		
		// Idle Timeout timer
		var gIdleTimerMain = null;
		
		// Timer used to display the count down (i.e. counting down each second until logout).
		var gIdleTimerTime = null;
		
		// Timer used to check for ckeditor presence
		var gIdleTimerCKListener = null;
		
		// Timer to add basic listeners
		var gIdleTimerIframeListener = null;
		
		// Logout url
		var LOG_OUT_SSO = logoutSSO;
		
		/**
		 * Function to get the cookie
		 * @private
		 * @returns Value of the "cookieName" cookie.
		 */
		getCookie = function() {
			var returnValue;
			var cookieValue = document.cookie.split("; ");
			var temp;
			// TODO consider using regex to extract the cookie
			for (var i = 0; i < cookieValue.length; i++) {
				temp = cookieValue[i].substr(0, cookieValue[i].indexOf("="));
				if (temp === COOKIE_NAME) {
					returnValue = cookieValue[i]
							.substr(cookieValue[i].indexOf("=") + 1);
					i = cookieValue.length;
				}
			}
			// TODO unescape is deprecated
			var returnValue = unescape(returnValue);
			if (DEBUG) console.debug("*IdleTimer.getCookie(): " +returnValue);
			return returnValue;
		};

		/**
		 * Function to set the cookie
		 * @private
		 * @param newTime value of the cookie to be set
		 */
		setCookie = function (newTime) {
			var cookie = COOKIE_NAME + "=" + newTime + ";path=/" +";domain=" + COOKIE_DOMAIN;
			document.cookie = cookie;
//			if (DEBUG) console.debug("*IdleTimer.setCookie(): " +cookie);
		};

		/**
		 * Call this function to start timer
		 * @private
		 */
		idleTimerTime = function() {
			if (DEBUG) console.debug("*IdleTimer.idleTimerTime(): ");
			
			//Last action time is page load as the user must have done something to get here i.e. log in, open a new link, etc.
			lastActionTime = new Date().getTime();
			setCookie(lastActionTime);

			// Get current time and last action time from cookie and compare
			gIdleTimerMain = setInterval(function() {
				var currentTime = new Date().getTime();
				lastActionTime = getCookie(COOKIE_NAME);
				
				console.log(IDLE_TIMEOUT);
			    console.log(currentTime - lastActionTime);
			    console.log("-------"); 

				//If difference between current time and last action exceeds the timeout, show the warning dialog
				// TODO error case should be handled (if for some reason the cookie is not found)
				if (currentTime - lastActionTime >= IDLE_TIMEOUT) {
					showIdleTimerDialog(COUNT_DOWN_INITIAL);
				}
			}, CHECK_TIME_PERIOD);
		};

		/**
		 * Create event handlers to check for activity.
		 * @private
		 */
		addEventListeners = function () {
			// TODO update to handle IE and Framesets for notes?
			
			// basic mouse and keyboard listeners
			addKeyboardAndMouseListeners(window);
			
			// basic mouse and keyboard listeners for frames (e.g. scnotes)
			// also add iframe listeners to each frame
			for(var i = 0; i < window.frames.length; i++) {
				try {
					addKeyboardAndMouseListeners(window.frames[i]);
					setInterval(function(){addIframeListeners(window.frames[i]);}, CHECK_IFRAMELISTENER_FREQUENCY);
				} catch(e) {
					//Catch any attempts to register frame listeners cross domain to account for the ST proxy iframes on every page
				}
			}
			
			// CKEditor listeners; since ckeditor might not be immediately present, we need to periodically check
			gIdleTimerCKListener = setInterval(function(){addIdleTimerCKEditorListeners();}, CHECK_CKEDITOR_FREQUENCY);

			// iframe listener. since iframe (e.g. compose note on scnotes page) might not be immediately present, we need to periodically check
			gIdleTimerIframeListener = setInterval(function(){addIframeListeners(window);}, CHECK_IFRAMELISTENER_FREQUENCY);
			
		};
		
		/**
		 * add listeners for keyboard and mouse
		 * @param where Likely will be either "window" or a "frame"
		 */
		addKeyboardAndMouseListeners = function(where) {
			if (typeof where != 'undefined' && where != null) {
				if ((isIE() == false) || (isIE()>8)) {
					where.addEventListener("mousedown", idleTimerProcessEvent, false);
					where.addEventListener("mousemove", idleTimerProcessEvent, false);
					where.addEventListener("scroll", idleTimerProcessEvent, false);
					where.addEventListener("keydown", idleTimerProcessEvent, false);
				} else{
					where.attachEvent("mousedown", idleTimerProcessEvent);
					where.attachEvent("mousemove", idleTimerProcessEvent);
					where.attachEvent("scroll", idleTimerProcessEvent);
					where.attachEvent("keydown", idleTimerProcessEvent);
				}
			}
			
		};
		
		/**
		 * Find all iFrames and attach basic mouse and keyboard listeners to each.
		 */
		addIframeListeners = function(where) {
			if (typeof where != 'undefined' && where != null) {
				try {
					var iframes = where.document.getElementsByTagName("iframe");
					
					for (var i = 0; i<iframes.length; i++) {
						 try {
							 addKeyboardAndMouseListeners(iframes[i].contentWindow.document.body);	
						 } catch(e) {
							 if (DEBUG) console.log("Idle event listener not added to iframe");
					     }
					}
				} catch(e) {
					if (DEBUG) console.log("Idle event listener not added to iframe");
			    }
			}	
		};

		/**
		 * Find all CKEDITOR instances and attach basic mouse and keyboard listeners to each one.
		 */
		addIdleTimerCKEditorListeners = function() {	
			if (DEBUG) {
				console.log('DEBUG INFO - addIdleTimerCKEditorListeners');
			}
			if (typeof CKEDITOR !== "undefined") {
				for(var instanceName in CKEDITOR.instances) {
					
					CKEDITOR.instances[instanceName].on('key', function(e){ idleTimerProcessEvent(e); });

					CKEDITOR.instances[instanceName].on('selectionChange', function(e){ idleTimerProcessEvent(e); });
/* <AC> editorName appears to be undefined
					CKEDITOR.instances[editorName].on('focus', function(e){ idleTimerProcessEvent(e); });

					CKEDITOR.instances[editorName].on('saveSnapshot', function(e){ idleTimerProcessEvent(e); });

					CKEDITOR.instances[editorName].on('afterUndo', function(e){ idleTimerProcessEvent(e); });

					CKEDITOR.instances[editorName].on('afterRedo', function(e){ idleTimerProcessEvent(e); });*/
				}
			}
		};

		
		/**
		 * Handle activity events. Record the current time in lastActionTime and set the cookie (with the same value). 
		 * Cookie will be read by other pages. So:
		 * a) lastActionTime is most recent action time on the current page
		 * b) the cookie has the most recent action time across all pages
		 * @private
		 */
		idleTimerProcessEvent = function (event) {
			if (DEBUG) console.debug("*IdleTimer.idleTimerProcessEvent(): ");
			//Update last action time based on user action
			lastActionTime = new Date().getTime();
			setCookie(lastActionTime);
			//If the warning is showing, we want to hide and reset it
			if (warningIsDisplayed === true) {
				hideIdleTimerDialog();
			}
		};

		/**
		 * Show warning dialog for some number of seconds (warningDuration). Set a CHECK_TIME_PERIOD (1 second) interval 
		 * timer to display a count down (in seconds) until logout. If activity occurs while this dialog is displayed,
		 * the interval timer will be cancelled and the dialog will be hidden.
		 * @private
		 */
		showIdleTimerDialog = function (warningDuration) {
			if (DEBUG) console.debug("*IdleTimer.showIdleTimerDialog(): ");

			warningIsDisplayed = true;
			var displayTime = new Date().getTime();

			// stop the idle timer
			clearInterval(gIdleTimerMain);

			var ele1 = document.getElementById("countdown");
			var ele2 = document.getElementById("idleWarning");

			ele1.innerHTML = warningDuration;
			ele2.style.display = "block";
			gIdleTimerTime = setInterval(function() {
				if (DEBUG) console.debug("*IdleTimer.showIdleTimerDialog: warning count down = " +warningDuration);
				lastActionTime = getCookie(COOKIE_NAME);
				if (lastActionTime > displayTime) {
					hideIdleTimerDialog();
				} else {
					ele1.innerHTML = warningDuration;
					warningDuration = warningDuration - 1;
					if (warningDuration <= 0) {
						console.log("Logging out");
						window.location = LOG_OUT_SSO;
					}
				}
			}, CHECK_TIME_PERIOD);

		};

		/**
		 * Cancel the logout countdown timer, and hide the warning dialog
		 * @private
		 */
		hideIdleTimerDialog = function () {
			if (DEBUG) console.debug("*IdleTimer.hideIdleTimerDialog(): ");
			warningIsDisplayed = false;
			
			// restart the idle timer
			idleTimerTime();
			
			var ele2 = document.getElementById("idleWarning");
			ele2.style.display = "none";

			if (gIdleTimerTime) {
				clearInterval(gIdleTimerTime);
			}
		};
		
		/**
		 * Check IE version.
		 * @private
		 */

 function isIE() {
			var nav = navigator.userAgent.toLowerCase();
			return (nav.indexOf('msie') != -1) ? parseInt(nav.split('msie')[1]) : false;
		};

		/**
		 * Add markup to DOM for the warning dialog.
		 * @private
		 */
		createIdleWarningDiv = function () {
			if (DEBUG) console.debug("*IdleTimer.createIdleWarningDiv(): ");
			var div = document.createElement("div");
			var text = document.createElement("h5");
			var span1 = document.createElement("span1");
//			var span2 = document.createElement("span2");

			span1.className = "time";
			span1.innerHTML = "60s";
			span1.id = "countdown";
//			span2.className = "info";
//			span2.innerHTML = "Not ready to be logged out? Just click somewhere on the page."

			text.innerHTML = translationText;
			text.appendChild(span1);
//			text.appendChild(span2);

			div.appendChild(text);

			div.style.background = "#dadada";
			div.style.filter = "progid:DXImageTransform.Microsoft.gradient( startColorstr='#dadada', endColorstr='#dadada',GradientType=0 )";
			div.style.boxShadow = "0 3px 5px rgba(0,0,0,0.2)";
			div.style.borderBottom = "1px solid #eee";
			div.style.display = "none";
			div.style.position = "fixed";
			div.style.top = "0px";
			div.style.left = "0px";
			div.style.width = "100%";
			div.style.padding = "0 5px";
			div.style.zIndex = "2001";

			text.style.padding = "0 0 0 25px";
			text.style.fontSize = "14px";
			text.style.fontWeight = "bold";
			text.style.color = "#363636";
			text.style.textShadow = "0 1px 0 #fafafa";
			text.style.margin = "12px auto";

			span1.style.background = "#e1be37";

			span1.style.filter = "progid:DXImageTransform.Microsoft.gradient( startColorstr='#e1be37', endColorstr='#d7791f',GradientType=0 )";
			span1.style.border = "1px solid #98723c";
			span1.style.borderRadius = "3px";
			span1.style.color = "#fff";
			span1.style.textShadow = "0 1px 0 #825216";
			span1.style.padding = "2px 3px";
			span1.style.marginLeft = "7px";
			span1.style.textAlign = "center";
			span1.style.width = "30px";
			span1.style.display = "inline-block";

//			span2.style.color = "#767676";
//			span2.style.fontWeight = "normal";
//			span2.style.paddingLeft = "10px";

			if (isIE() == false) {
				div.style.background = "-moz-linear-gradient(top, #dadada 0%, #e8e8e8 50%, #dadada 100%)";
				div.style.background = "-webkit-gradient(linear, left top, left bottom, color-stop(0%,#dadada), color-stop(50%,#e8e8e8), color-stop(100%,#dadada))";
				div.style.background = "-webkit-linear-gradient(top, #dadada 0%,#e8e8e8 50%,#dadada 100%)";
				div.style.background = "-o-linear-gradient(top, #dadada 0%,#e8e8e8 50%,#dadada 100%)";
				div.style.background = "-ms-linear-gradient(top, #dadada 0%,#e8e8e8 50%,#dadada 100%)";
				div.style.background = "linear-gradient(to bottom, #dadada 0%,#e8e8e8 50%,#dadada 100%)";
			} else if (isIE() > 7) {
				div.style.background = "-ms-linear-gradient(top, #dadada 0%,#e8e8e8 50%,#dadada 100%)";
			} else {}
			
			if (isIE() == false) {
				span1.style.background = "-moz-linear-gradient(top, #e1be37 0%, #d7791f 100%)";
				span1.style.background = "-webkit-gradient(linear, left top, left bottom, color-stop(0%,#e1be37), color-stop(100%,#d7791f))";
				span1.style.background = "-webkit-linear-gradient(top, #e1be37 0%,#d7791f 100%)";
				span1.style.background = "-o-linear-gradient(top, #e1be37 0%,#d7791f 100%)";
				span1.style.background = "-ms-linear-gradient(top, #e1be37 0%,#d7791f 100%)";
				span1.style.background = "linear-gradient(to bottom, #e1be37 0%,#d7791f 100%)";
			} else if (isIE() > 7) {
				span1.style.background = "-ms-linear-gradient(top, #e1be37 0%,#d7791f 100%)";
			} else {}

			div.id = "idleWarning";
			div.className = "logoutWarning";

			document.body.appendChild(div);
		}
		
		//Create warning message div
		createIdleWarningDiv();
		
		//Add listeners
		addEventListeners();
		
		//Start timer
		idleTimerTime();


	};
	return cls;
})();
var idleTimer = new IdleTimer(1, ".na.collabserv.com", "https://apps.na.collabserv.com.com/manage/account/logoutSSO", "Logging out soon... Press a Key!!");
