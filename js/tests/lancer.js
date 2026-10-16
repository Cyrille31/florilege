// Florilège — lance tous les tests avec Node :  node js/tests/lancer.js
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { executer } from './mini_test.js?v=0.13.0';
import './etat.test.js?v=0.13.0';

const { reussis, echecs } = await executer();
for (const e of echecs) console.log(`✗ ${e.nom} : ${e.erreur}`);
console.log(`${reussis} test(s) réussi(s), ${echecs.length} échec(s).`);
if (typeof process !== 'undefined' && echecs.length) process.exitCode = 1;
