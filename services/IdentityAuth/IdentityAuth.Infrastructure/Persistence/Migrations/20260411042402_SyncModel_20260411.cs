using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IdentityAuth.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SyncModel_20260411 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Users_Role_Status_CreatedAtUtc",
                table: "Users",
                columns: new[] { "Role", "Status", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_Role_Status_CreatedAtUtc",
                table: "Users");
        }
    }
}
