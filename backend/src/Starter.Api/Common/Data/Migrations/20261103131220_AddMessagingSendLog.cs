using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Starter.Api.Common.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMessagingSendLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MessagingSends",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StoreId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CollectionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReminderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Channel = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ProviderMessageId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Error = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Attempt = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MessagingSends", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MessagingSends_StoreId_CollectionId_ReminderId_Channel",
                table: "MessagingSends",
                columns: new[] { "StoreId", "CollectionId", "ReminderId", "Channel" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MessagingSends_StoreId_CreatedAt",
                table: "MessagingSends",
                columns: new[] { "StoreId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MessagingSends");
        }
    }
}
