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
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
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
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE TABLE [Users] (
        [UserId] uniqueidentifier NOT NULL,
        [Email] nvarchar(256) NOT NULL,
        [PasswordHash] nvarchar(1024) NOT NULL,
        [FullName] nvarchar(120) NOT NULL,
        [PhoneNumber] nvarchar(20) NOT NULL,
        [Role] nvarchar(32) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [CreditLimit] decimal(18,2) NOT NULL,
        [RejectionReason] nvarchar(400) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([UserId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE TABLE [DealerProfiles] (
        [DealerProfileId] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [BusinessName] nvarchar(180) NOT NULL,
        [GstNumber] nvarchar(20) NOT NULL,
        [TradeLicenseNo] nvarchar(80) NOT NULL,
        [Address] nvarchar(300) NOT NULL,
        [City] nvarchar(100) NOT NULL,
        [State] nvarchar(100) NOT NULL,
        [PinCode] nvarchar(6) NOT NULL,
        [IsInterstate] bit NOT NULL,
        CONSTRAINT [PK_DealerProfiles] PRIMARY KEY ([DealerProfileId]),
        CONSTRAINT [FK_DealerProfiles_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([UserId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE TABLE [OtpRecords] (
        [OtpRecordId] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [OtpHash] nvarchar(128) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [ExpiresAtUtc] datetime2 NOT NULL,
        [IsUsed] bit NOT NULL,
        [UsedAtUtc] datetime2 NULL,
        CONSTRAINT [PK_OtpRecords] PRIMARY KEY ([OtpRecordId]),
        CONSTRAINT [FK_OtpRecords_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([UserId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE TABLE [RefreshTokens] (
        [RefreshTokenId] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [TokenHash] nvarchar(128) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [ExpiresAtUtc] datetime2 NOT NULL,
        [IsRevoked] bit NOT NULL,
        [RevokedAtUtc] datetime2 NULL,
        CONSTRAINT [PK_RefreshTokens] PRIMARY KEY ([RefreshTokenId]),
        CONSTRAINT [FK_RefreshTokens_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([UserId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DealerProfiles_GstNumber] ON [DealerProfiles] ([GstNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DealerProfiles_UserId] ON [DealerProfiles] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_OtpRecords_UserId] ON [OtpRecords] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_RefreshTokens_TokenHash] ON [RefreshTokens] ([TokenHash]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_RefreshTokens_UserId] ON [RefreshTokens] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_Email] ON [Users] ([Email]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174525_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260328174525_InitialCreate', N'10.0.5');
END;

COMMIT;
GO

