import type {
  AfterAll,
  AfterEach,
  AsymmetricMatcher,
  BeforeAll,
  BeforeEach,
  Describe,
  Expect,
  ExpectTypeOf,
  It,
  Mock,
  MockFunction,
  SpyOn,
  Test,
  Vi,
} from '../index';

// --- Type exports are resolvable ---

type _AssertDescribe = Describe;
type _AssertIt = It;
type _AssertTest = Test;
type _AssertExpect = Expect;
type _AssertBeforeEach = BeforeEach;
type _AssertAfterEach = AfterEach;
type _AssertBeforeAll = BeforeAll;
type _AssertAfterAll = AfterAll;
type _AssertMock = Mock;
type _AssertMockFunction = MockFunction;
type _AssertSpyOn = SpyOn;
type _AssertVi = Vi;
type _AssertExpectTypeOf = ExpectTypeOf;
type _AssertAsymmetricMatcher = AsymmetricMatcher;

// --- Negative type tests ---

declare const describeVal: Describe;
// @ts-expect-error - describe requires name and fn, not just fn
describeVal(() => {});

declare const mockFnVal: MockFunction;
// @ts-expect-error - mock.calls is readonly array, not a string
const _badCalls: string = mockFnVal.mock.calls;
