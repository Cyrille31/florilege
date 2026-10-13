// Florilège — mini-cadre de tests, sans dépendance : fonctionne dans le navigateur (tests.html) et avec Node.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

const tests = [];

export function test(nom, fn) {
  tests.push({ nom, fn });
}

export function egal(obtenu, attendu, message = '') {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${message} — obtenu ${a}, attendu ${b}`);
}

export function vrai(valeur, message = 'valeur fausse') {
  if (!valeur) throw new Error(message);
}

// Exécute tous les tests enregistrés ; renvoie { reussis, echecs: [{ nom, erreur }] }.
export async function executer() {
  const echecs = [];
  let reussis = 0;
  for (const t of tests) {
    try {
      await t.fn();
      reussis++;
    } catch (e) {
      echecs.push({ nom: t.nom, erreur: e.message });
    }
  }
  return { reussis, echecs };
}
