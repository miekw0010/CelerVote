from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('events', '0004_voterroll_voter_id_index'),
    ]

    operations = [
        # The column 'code' already exists in the database
        # So we just mark this migration as done
        migrations.RunSQL(
            sql="SELECT 1",  # Dummy operation that does nothing
            reverse_sql="SELECT 1"
        ),
    ]