import { s } from '@vertz/schema';

console.log('=== @vertz/schema Examples ===\n');

// Example 1: Basic validation
console.log('1. Basic Validation:');
const userSchema = s.object({
  name: s.string().min(1),
  email: s.string().email(),
  age: s.number().int().min(18),
});

const validUser = { name: 'Alice', email: 'alice@example.com', age: 25 };
console.log('✅ Valid user:', userSchema.parse(validUser));

const invalidUser = { name: '', email: 'not-an-email', age: 15 };
const result = userSchema.safeParse(invalidUser);
if (!result.success) {
  console.log('❌ Invalid user errors:', result.error.issues);
}

// Example 2: Transformations
console.log('\n2. Transformations:');
const trimmedSchema = s
  .string()
  .trim()
  .transform((s) => s.toUpperCase());
console.log('Input: "  hello  "');
console.log('Output:', trimmedSchema.parse('  hello  '));

// Example 3: Custom validation (refinements)
console.log('\n3. Custom Validation (Password):');
const passwordSchema = s
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((val) => /[A-Z]/.test(val), {
    message: 'Password must contain uppercase letter',
  })
  .refine((val) => /[0-9]/.test(val), {
    message: 'Password must contain number',
  });

const weakPassword = 'short';
const weakResult = passwordSchema.safeParse(weakPassword);
if (!weakResult.success) {
  console.log(
    '❌ Weak password:',
    weakResult.error.issues.map((i) => i.message),
  );
}

const strongPassword = 'SecurePass123';
console.log('✅ Strong password:', passwordSchema.parse(strongPassword));

// Example 4: Nested objects
console.log('\n4. Nested Objects:');
const addressSchema = s.object({
  street: s.string(),
  city: s.string(),
  zipCode: s.string().regex(/^\d{5}$/),
});

const personSchema = s.object({
  name: s.string(),
  address: addressSchema,
  phoneNumbers: s.array(s.string()),
});

const person = {
  name: 'Bob',
  address: {
    street: '123 Main St',
    city: 'Springfield',
    zipCode: '12345',
  },
  phoneNumbers: ['+1-555-0100', '+1-555-0200'],
};

console.log('✅ Valid person:', personSchema.parse(person));

// Example 5: Discriminated unions
console.log('\n5. Discriminated Unions:');
const messageSchema = s.discriminatedUnion('type', [
  s.object({
    type: s.literal('text'),
    content: s.string(),
  }),
  s.object({
    type: s.literal('image'),
    url: s.url(),
    alt: s.string().optional(),
  }),
]);

const textMessage = { type: 'text' as const, content: 'Hello!' };
const imageMessage = {
  type: 'image' as const,
  url: 'https://example.com/image.png',
  alt: 'Example image',
};

console.log('✅ Text message:', messageSchema.parse(textMessage));
console.log('✅ Image message:', messageSchema.parse(imageMessage));

// Example 6: Coercion
console.log('\n6. Type Coercion:');
const coerceSchema = s.object({
  count: s.coerce.number(),
  enabled: s.coerce.boolean(),
  timestamp: s.coerce.date(),
});

const coercedData = {
  count: '42', // string → number
  enabled: 'true', // string → boolean
  timestamp: '2024-01-01T00:00:00Z', // string → Date
};

console.log('✅ Coerced data:', coerceSchema.parse(coercedData));

// Example 7: Default values
console.log('\n7. Default Values:');
const configSchema = s.object({
  host: s.string().default('localhost'),
  port: s.number().default(3000),
  debug: s.boolean().default(false),
});

const partialConfig = { port: 8080 };
console.log('✅ Config with defaults:', configSchema.parse(partialConfig));

console.log('\n=== All examples completed! ===');
