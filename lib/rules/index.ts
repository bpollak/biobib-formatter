import { FormattingRule } from '../types';
import marginRules from './margins';
import fontRules from './fonts';
import spacingRules from './spacing';
import paginationRules from './pagination';
import pageOrderRules from './page-order';
import titlePageRules from './title-page';
import abstractRules from './abstract';
import figuresTablesRules from './figures-tables';
import referencesRules from './references';
import headingRules from './headings';
import indentationRules from './indentation';
import accessibilityRules from './accessibility';

export const allRules: FormattingRule[] = [
  ...marginRules,
  ...fontRules,
  ...spacingRules,
  ...indentationRules,
  ...paginationRules,
  ...pageOrderRules,
  ...titlePageRules,
  ...abstractRules,
  ...figuresTablesRules,
  ...referencesRules,
  ...headingRules,
  ...accessibilityRules,
];

export {
  marginRules,
  fontRules,
  spacingRules,
  paginationRules,
  pageOrderRules,
  titlePageRules,
  abstractRules,
  figuresTablesRules,
  referencesRules,
  headingRules,
  indentationRules,
  accessibilityRules,
};
