const ldap = require('ldapjs');
const dotenv = require('dotenv');
dotenv.config();

const LDAP_URL = process.env.LDAP_URL || 'ldap://ad.example.local:389';
const LDAP_BASE = process.env.LDAP_BASE || 'DC=example,DC=local';
const LDAP_BIND_DN = process.env.LDAP_BIND_DN || ''; // service account DN
const LDAP_BIND_PW = process.env.LDAP_BIND_PW || ''; // service account password

function authenticate(username, password) {
  return new Promise((resolve, reject) => {
    // Try simple bind using userPrincipalName (username@domain) first
    const client = ldap.createClient({ url: LDAP_URL });
    const userPrincipal = username.includes('@') ? username : `${username}@${LDAP_BASE.split(',')[0].split('=')[1]}`;

    // Attempt to bind as the user to validate credentials
    client.bind(userPrincipal, password, (err) => {
      if (err) {
        client.unbind();
        return reject(new Error('invalid_credentials'));
      }
      // On success, search for groups
      const opts = {
        filter: `(sAMAccountName=${username})`,
        scope: 'sub',
        attributes: ['memberOf', 'sAMAccountName', 'cn', 'userPrincipalName']
      };
      client.search(LDAP_BASE, opts, (err2, res) => {
        if (err2) {
          client.unbind();
          return resolve({ username, groups: [] });
        }
        const entries = [];
        res.on('searchEntry', (entry) => entries.push(entry.object));
        res.on('error', () => {
          client.unbind();
          resolve({ username, groups: [] });
        });
        res.on('end', () => {
          client.unbind();
          const groups = (entries[0] && entries[0].memberOf) ? (Array.isArray(entries[0].memberOf) ? entries[0].memberOf : [entries[0].memberOf]) : [];
          resolve({ username, groups });
        });
      });
    });
  });
}

module.exports = { authenticate };

