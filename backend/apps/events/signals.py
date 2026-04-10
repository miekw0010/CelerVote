"""
events/signals.py
Delete Cloudinary assets when Candidate or Event records are removed.
Without this, deleted photos/banners remain permanently accessible via URL.
"""
import logging
from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _destroy_cloudinary(field):
    """Delete a Cloudinary file given an ImageField instance."""
    if not field or not field.name:
        return
    try:
        import cloudinary.uploader
        # Cloudinary public_id is the name without extension
        public_id = field.name.rsplit('.', 1)[0]
        cloudinary.uploader.destroy(public_id)
        logger.info(f'Cloudinary asset deleted: {public_id}')
    except Exception as e:
        logger.warning(f'Could not delete Cloudinary asset {getattr(field, "name", "unknown")}: {e}')


@receiver(post_delete, sender='events.Candidate')
def delete_candidate_photo(sender, instance, **kwargs):
    _destroy_cloudinary(instance.photo)


@receiver(post_delete, sender='events.Event')
def delete_event_images(sender, instance, **kwargs):
    _destroy_cloudinary(instance.banner_image)
    _destroy_cloudinary(instance.thumbnail)


@receiver(pre_save, sender='events.Candidate')
def delete_old_candidate_photo(sender, instance, **kwargs):
    """When a candidate photo is replaced, delete the old Cloudinary asset."""
    if not instance.pk:
        return
    try:
        from apps.events.models import Candidate
        old = Candidate.objects.get(pk=instance.pk)
        if old.photo and old.photo != instance.photo:
            _destroy_cloudinary(old.photo)
    except Exception:
        pass


@receiver(pre_save, sender='events.Event')
def delete_old_event_images(sender, instance, **kwargs):
    """When event images are replaced, delete the old Cloudinary assets."""
    if not instance.pk:
        return
    try:
        from apps.events.models import Event
        old = Event.objects.get(pk=instance.pk)
        if old.banner_image and old.banner_image != instance.banner_image:
            _destroy_cloudinary(old.banner_image)
        if old.thumbnail and old.thumbnail != instance.thumbnail:
            _destroy_cloudinary(old.thumbnail)
    except Exception:
        pass
