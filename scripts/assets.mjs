import {cpSync,mkdirSync} from 'node:fs';
mkdirSync('public',{recursive:true});
cpSync('assets','public/assets',{recursive:true});
