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
    WHERE [MigrationId] = N'20260328174653_InitialCreate'
)
BEGIN
    CREATE TABLE [Notifications] (
        [NotificationId] uniqueidentifier NOT NULL,
        [RecipientUserId] uniqueidentifier NULL,
        [Title] nvarchar(180) NOT NULL,
        [Body] nvarchar(4000) NOT NULL,
        [SourceService] nvarchar(100) NOT NULL,
        [EventType] nvarchar(100) NOT NULL,
        [Channel] nvarchar(20) NOT NULL,
        [Status] nvarchar(20) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [SentAtUtc] datetime2 NULL,
        [FailureReason] nvarchar(1000) NULL,
        CONSTRAINT [PK_Notifications] PRIMARY KEY ([NotificationId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174653_InitialCreate'
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
    WHERE [MigrationId] = N'20260328174653_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Notifications_CreatedAtUtc] ON [Notifications] ([CreatedAtUtc]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174653_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Notifications_RecipientUserId] ON [Notifications] ([RecipientUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174653_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260328174653_InitialCreate', N'10.0.5');
END;

COMMIT;
GO

