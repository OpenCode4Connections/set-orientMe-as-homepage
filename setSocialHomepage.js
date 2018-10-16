//
// @name setSocialHomepage customization
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
try {
  var ie11 = !window.ActiveXObject && 'ActiveXObject' in window && !/x64|x32/gi.test(window.navigator.userAgent);

  console.log('setSocialHomepage - Browser = IE11 : ' + ie11);

  // dont redirect IE11 users
  if (ie11) {
    window.localStorage.removeItem('defaultHomeLink');
  } else {
    var defaultHomeLink = window.localStorage.getItem('defaultHomeLink');
    if (defaultHomeLink == null) {
      var dt = new Date().getTime();
      var val = { value: 'orient', timestamp: dt };
      window.localStorage.setItem('defaultHomeLink', JSON.stringify(val));
      location.replace(baseProtocol + '://' + baseHost + '/social/home');
    }
  }
} catch (e) {
  console.error('Exception occurred in setSocialHomepage.js : ' + e);
}
