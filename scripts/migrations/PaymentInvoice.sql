IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    CREATE TABLE [DealerCreditAccounts] (
        [AccountId] uniqueidentifier NOT NULL,
        [DealerId] uniqueidentifier NOT NULL,
        [CreditLimit] decimal(18,2) NOT NULL,
        [CurrentOutstanding] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_DealerCreditAccounts] PRIMARY KEY ([AccountId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    CREATE TABLE [Invoices] (
        [InvoiceId] uniqueidentifier NOT NULL,
        [InvoiceNumber] nvarchar(40) NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [DealerId] uniqueidentifier NOT NULL,
        [IdempotencyKey] nvarchar(64) NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [GstType] nvarchar(20) NOT NULL,
        [GstRate] decimal(6,2) NOT NULL,
        [GstAmount] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [PdfStoragePath] nvarchar(500) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_Invoices] PRIMARY KEY ([InvoiceId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    CREATE TABLE [OutboxMessages] (
        [MessageId] uniqueidentifier NOT NULL,
        [EventType] nvarchar(200) NOT NULL,
        [Payload] nvarchar(max) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [PublishedAtUtc] datetime2 NULL,
        [RetryCount] int NOT NULL,
        [Error] nvarchar(2000) NULL,
        CONSTRAINT [PK_OutboxMessages] PRIMARY KEY ([MessageId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    CREATE TABLE [PaymentRecords] (
        [PaymentRecordId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [DealerId] uniqueidentifier NOT NULL,
        [PaymentMode] nvarchar(20) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [ReferenceNo] nvarchar(100) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_PaymentRecords] PRIMARY KEY ([PaymentRecordId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    CREATE TABLE [InvoiceLines] (
        [InvoiceLineId] uniqueidentifier NOT NULL,
        [InvoiceId] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [ProductName] nvarchar(220) NOT NULL,
        [Sku] nvarchar(60) NOT NULL,
        [HsnCode] nvarchar(20) NOT NULL,
        [Quantity] int NOT NULL,
        [UnitPrice] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_InvoiceLines] PRIMARY KEY ([InvoiceLineId]),
        CONSTRAINT [FK_InvoiceLines_Invoices_InvoiceId] FOREIGN KEY ([InvoiceId]) REFERENCES [Invoices] ([InvoiceId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DealerCreditAccounts_DealerId] ON [DealerCreditAccounts] ([DealerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_InvoiceLines_InvoiceId] ON [InvoiceLines] ([InvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Invoices_IdempotencyKey] ON [Invoices] ([IdempotencyKey]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Invoices_InvoiceNumber] ON [Invoices] ([InvoiceNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174637_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260328174637_InitialCreate', N'10.0.5');
END;

COMMIT;
GO

