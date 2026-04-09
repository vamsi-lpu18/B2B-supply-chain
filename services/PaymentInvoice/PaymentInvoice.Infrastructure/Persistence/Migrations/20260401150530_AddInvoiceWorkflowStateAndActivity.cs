using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PaymentInvoice.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoiceWorkflowStateAndActivity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InvoiceWorkflowActivities",
                columns: table => new
                {
                    ActivityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Message = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    CreatedByRole = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceWorkflowActivities", x => x.ActivityId);
                    table.ForeignKey(
                        name: "FK_InvoiceWorkflowActivities_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "InvoiceId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InvoiceWorkflowStates",
                columns: table => new
                {
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    DueAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PromiseToPayAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    NextFollowUpAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    InternalNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ReminderCount = table.Column<int>(type: "int", nullable: false),
                    LastReminderAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceWorkflowStates", x => x.InvoiceId);
                    table.ForeignKey(
                        name: "FK_InvoiceWorkflowStates_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "InvoiceId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceWorkflowActivities_InvoiceId_CreatedAtUtc",
                table: "InvoiceWorkflowActivities",
                columns: new[] { "InvoiceId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvoiceWorkflowActivities");

            migrationBuilder.DropTable(
                name: "InvoiceWorkflowStates");
        }
    }
}
