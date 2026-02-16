export declare const usersTable: import('@vertz/db').TableDef<{
  id: import('@vertz/db').ColumnBuilder<
    string,
    Omit<
      {
        readonly sqlType: 'uuid';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'primary' | 'hasDefault'
    > & {
      readonly primary: true;
      readonly hasDefault: true;
    }
  >;
  name: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  email: import('@vertz/db').ColumnBuilder<string, import('@vertz/db').FormatMeta<'text', 'email'>>;
  role: import('@vertz/db').ColumnBuilder<
    'admin' | 'editor' | 'viewer',
    Omit<
      import('@vertz/db').EnumMeta<'user_role', readonly ['admin', 'editor', 'viewer']>,
      'hasDefault'
    > & {
      readonly hasDefault: true;
      readonly defaultValue: 'admin' | 'now' | 'editor' | 'viewer';
    }
  >;
  orgId: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'uuid';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  passwordHash: import('@vertz/db').ColumnBuilder<
    string,
    Omit<
      {
        readonly sqlType: 'text';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'hidden'
    > & {
      readonly hidden: true;
    }
  >;
  internalNotes: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  createdAt: import('@vertz/db').ColumnBuilder<
    Date,
    Omit<
      {
        readonly sqlType: 'timestamp with time zone';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'hasDefault'
    > & {
      readonly hasDefault: true;
      readonly defaultValue: 'now' | Date;
    }
  >;
  updatedAt: import('@vertz/db').ColumnBuilder<
    Date,
    Omit<
      {
        readonly sqlType: 'timestamp with time zone';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'hasDefault'
    > & {
      readonly hasDefault: true;
      readonly defaultValue: 'now' | Date;
    }
  >;
}>;
export declare const orgsTable: import('@vertz/db').TableDef<{
  id: import('@vertz/db').ColumnBuilder<
    string,
    Omit<
      {
        readonly sqlType: 'uuid';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'primary' | 'hasDefault'
    > & {
      readonly primary: true;
      readonly hasDefault: true;
    }
  >;
  name: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  logo: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  billingEmail: import('@vertz/db').ColumnBuilder<
    string,
    import('@vertz/db').FormatMeta<'text', 'email'>
  >;
  taxId: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  createdAt: import('@vertz/db').ColumnBuilder<
    Date,
    Omit<
      {
        readonly sqlType: 'timestamp with time zone';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'hasDefault'
    > & {
      readonly hasDefault: true;
      readonly defaultValue: 'now' | Date;
    }
  >;
}>;
export declare const postsTable: import('@vertz/db').TableDef<{
  id: import('@vertz/db').ColumnBuilder<
    string,
    Omit<
      {
        readonly sqlType: 'uuid';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'primary' | 'hasDefault'
    > & {
      readonly primary: true;
      readonly hasDefault: true;
    }
  >;
  authorId: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'uuid';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  title: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  content: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  published: import('@vertz/db').ColumnBuilder<
    boolean,
    Omit<
      {
        readonly sqlType: 'boolean';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'hasDefault'
    > & {
      readonly hasDefault: true;
      readonly defaultValue: boolean | 'now';
    }
  >;
  views: import('@vertz/db').ColumnBuilder<
    number,
    Omit<
      {
        readonly sqlType: 'integer';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'hasDefault'
    > & {
      readonly hasDefault: true;
      readonly defaultValue: number | 'now';
    }
  >;
  createdAt: import('@vertz/db').ColumnBuilder<
    Date,
    Omit<
      {
        readonly sqlType: 'timestamp with time zone';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'hasDefault'
    > & {
      readonly hasDefault: true;
      readonly defaultValue: 'now' | Date;
    }
  >;
}>;
export declare const commentsTable: import('@vertz/db').TableDef<{
  id: import('@vertz/db').ColumnBuilder<
    string,
    Omit<
      {
        readonly sqlType: 'uuid';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'primary' | 'hasDefault'
    > & {
      readonly primary: true;
      readonly hasDefault: true;
    }
  >;
  postId: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'uuid';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  authorId: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'uuid';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  content: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  createdAt: import('@vertz/db').ColumnBuilder<
    Date,
    Omit<
      {
        readonly sqlType: 'timestamp with time zone';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'hasDefault'
    > & {
      readonly hasDefault: true;
      readonly defaultValue: 'now' | Date;
    }
  >;
}>;
export declare const auditLogsTable: import('@vertz/db').TableDef<{
  id: import('@vertz/db').ColumnBuilder<
    string,
    Omit<
      {
        readonly sqlType: 'uuid';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'primary' | 'hasDefault'
    > & {
      readonly primary: true;
      readonly hasDefault: true;
    }
  >;
  userId: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'uuid';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  action: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  ipAddress: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  userAgent: import('@vertz/db').ColumnBuilder<
    string,
    {
      readonly sqlType: 'text';
      readonly primary: false;
      readonly unique: false;
      readonly nullable: false;
      readonly hasDefault: false;
      readonly sensitive: false;
      readonly hidden: false;
      readonly isTenant: false;
      readonly references: null;
      readonly check: null;
    }
  >;
  createdAt: import('@vertz/db').ColumnBuilder<
    Date,
    Omit<
      {
        readonly sqlType: 'timestamp with time zone';
        readonly primary: false;
        readonly unique: false;
        readonly nullable: false;
        readonly hasDefault: false;
        readonly sensitive: false;
        readonly hidden: false;
        readonly isTenant: false;
        readonly references: null;
        readonly check: null;
      },
      'hasDefault'
    > & {
      readonly hasDefault: true;
      readonly defaultValue: 'now' | Date;
    }
  >;
}>;
//# sourceMappingURL=fixtures.d.ts.map
