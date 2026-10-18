import type { PersonRecord } from '@/core/people/people';
import { baseName } from '@/core/storage/types';
import type { Variable } from '@/core/variables/types';
import { uniqueFileName } from '@/core/workspace/workspace';
import { safeName, type PersonCase } from '../model/cases';
import { fillText, makeResolver, personGender, placeholderValues } from '../model/placeholders';
import { scanName } from '../model/scanNames';
import { fileTitle } from '../model/transfer';
import { sectionOfRel, type DriveDoc } from './model';

/*
 * Имена на Google Диске — по правилам оформления (drive.json → rules):
 * папка бойца — по шаблону из данных, сканы — по шаблону имени сканов, остальное — как на устройстве.
 */

/** Имя папки бойца по шаблону правил. */
export function personFolderName(doc: DriveDoc, record: Pick<PersonRecord, 'fields'>, c?: PersonCase, vars: Variable[] = []): string {
  const r = makeResolver(placeholderValues(record, c), personGender(record.fields), vars);
  return safeName(fillText(doc.rules.personFolder, r.resolve)) || safeName(c?.fio ?? '') || 'Без имени';
}

/** Имя файла на Диске по правилам (без повторов в той же папке на Диске). */
export function makeNameFor(doc: DriveDoc, c: PersonCase, record: Pick<PersonRecord, 'fields'>, scanTemplate: string, vars: Variable[] = []): (rel: string) => string {
  const values = placeholderValues(record, c);
  const gender = personGender(record.fields);
  return (rel: string) => {
    const own = baseName(rel);
    let name = own;
    if (doc.rules.scanNames && sectionOfRel(rel) === 'scans' && c.files[rel]?.kind) {
      name = scanName(scanTemplate, { rel, doc: fileTitle(c, rel) }, 0, { values, gender, vars }).to;
    }
    const mine = doc.files.find((f) => f.personId === c.personId && f.rel === rel);
    const taken = new Set(doc.files.filter((f) => f.personId === c.personId && f.rel !== rel && (!mine || f.parent === mine.parent)).map((f) => f.name.toLowerCase()));
    return mine?.name === name ? name : uniqueFileName(name, taken);
  };
}
