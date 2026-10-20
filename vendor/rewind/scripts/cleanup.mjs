import {join} from 'node:path';
import {homedir} from 'node:os';
import {collectGarbage} from '../src/garbage.mjs';
const result=await collectGarbage(join(process.env.DSH_HOME||join(homedir(),'.dsh'),'rewind-plus','v1'),{apply:process.argv.includes('--apply')});
if(result.busy)throw Error('有备份或恢复正在执行，请稍后重试');
console.log(JSON.stringify(result,null,2));
