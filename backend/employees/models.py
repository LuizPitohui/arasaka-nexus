from django.db import models

class Employee(models.Model):
    # Definindo os cargos possíveis (Boa prática: usar choices)
    ROLE_CHOICES = [
        ('DEV', 'Developer'),
        ('DES', 'Designer'),
        ('MGR', 'Manager'),
        ('SEC', 'Security'),
    ]

    full_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=3, choices=ROLE_CHOICES, default='DEV')
    department = models.CharField(max_length=50)
    admission_date = models.DateField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.full_name} - {self.role}"