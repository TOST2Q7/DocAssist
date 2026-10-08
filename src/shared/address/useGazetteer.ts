import { useMemo } from 'react';
import { useDictionary } from '@/core/dictionaries/dictionaries';
import { Gazetteer, type AddressDictValue } from './gazetteer';

export const ADDRESS_DICT = 'address';

/** Газеттир = встроенная база + пользовательские дополнения из рабочей папки. */
export function useGazetteer() {
  const dict = useDictionary<AddressDictValue>(ADDRESS_DICT);
  const gaz = useMemo(() => new Gazetteer(dict.entries.map((e) => e.value)), [dict.entries]);
  return { gaz, dict };
}
